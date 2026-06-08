import {
  AGENT_OUTPUT_SCHEMA_VERSION,
  agentOutputSchema,
  gatewayRequestSchema,
  roomContextFeedSchema,
  roomIdSchema
} from "@production-spec-graph/shared";
import { z } from "zod";

import {
  agentTurnPlanSchema,
  createCompletionProposalOutput,
  planAgentTurn,
  type AgentTurnPlan
} from "./agent-turn.js";
import {
  createDeterministicRuntimeMetadata,
  createMateAgentRuntimeConfig,
  createSkippedRuntimeMetadata,
  mateAgentRuntimeMetadataSchema,
  normalizeRuntimeAdapterResult,
  selectMateAgentPath,
  type MateAgentRuntimeAdapter,
  type MateAgentRuntimeConfig
} from "./agent-runtime.js";
import { createCanvasAgentPromptPack } from "./canvas-agent-prompt.js";
import {
  createRoomMemoryStore,
  type RoomMemoryDiagnostics,
  type RoomMemoryStore
} from "./room-memory.js";

/**
 * 确定性 mate turn 结果协议的版本标识。
 */
export const MATE_TURN_SCHEMA_VERSION = "mate-turn.v1";

/**
 * 单次 mate turn 的输入协议。context feed 必须属于同一个 room，避免 mate
 * 意外跨 room 推理。
 */
export const mateTurnRequestSchema = z
  .object({
    roomId: roomIdSchema,
    userMessage: z.string().trim().min(1).max(8_000).optional(),
    mode: z.enum(["respond", "passive"]).default("respond"),
    gateway: gatewayRequestSchema.optional(),
    context: roomContextFeedSchema
  })
  .refine((request) => request.roomId === request.context.roomId, {
    message: "context room id must match turn room id",
    path: ["context", "roomId"]
  });

/**
 * 单次 mate turn 的输出协议。它把原始 observations、推断 interpretation、
 * uncertainty、AI output 和 memory diagnostics 分开，方便调用方检查响应来源。
 */
export const mateTurnResultSchema = z.object({
  schemaVersion: z.literal(MATE_TURN_SCHEMA_VERSION),
  roomId: roomIdSchema,
  turnId: z.string().min(1).max(220),
  generatedAt: z.string().datetime(),
  basedOn: z.object({
    snapshotVersion: z.number().int().nonnegative(),
    eventVersion: z.number().int().nonnegative(),
    changedSinceSnapshot: z.boolean(),
    stale: z.boolean()
  }),
  observations: z.object({
    shapeCount: z.number().int().nonnegative(),
    shapeTypes: z.array(z.string()),
    textSnippets: z.array(z.string()),
    selectedShapeIds: z.array(z.string()),
    recentEventKinds: z.array(z.string())
  }),
  interpretation: z.object({
    intent: z.string(),
    confidence: z.enum(["low", "medium", "high"]),
    signals: z.array(z.string())
  }),
  agentTurn: agentTurnPlanSchema,
  uncertainty: z.array(z.string()),
  output: agentOutputSchema,
  runtime: mateAgentRuntimeMetadataSchema,
  memory: z.object({
    retainedTurnCount: z.number().int().nonnegative(),
    maxTurnsPerRoom: z.number().int().positive(),
    persistent: z.literal(false)
  })
});

export type MateTurnRequest = z.input<typeof mateTurnRequestSchema>;
export type MateTurnResult = z.infer<typeof mateTurnResultSchema>;

/**
 * 测试和 smoke 脚本用来生成确定性 turn 的运行时注入点。
 */
export type PrepareMateTurnOptions = {
  memoryStore?: RoomMemoryStore;
  now?: () => string;
  turnId?: () => string;
};

export type PrepareMateTurnWithRuntimeOptions = PrepareMateTurnOptions & {
  agentRuntime?: MateAgentRuntimeAdapter;
  runtimeConfig?: MateAgentRuntimeConfig;
};

/**
 * 根据用户消息和 room context feed 准备一次确定性 mate turn。
 *
 * 这是当前 AI 同事边界。它暂时不调用 LLM，而是校验输入、从画布提取事实观察、
 * 推断简单意图、选择 typed output、记录有界 memory，并用 `mateTurnResultSchema`
 * 校验最终结果。
 */
export function prepareMateTurn(
  input: MateTurnRequest,
  {
    memoryStore = createRoomMemoryStore(),
    now = () => new Date().toISOString(),
    turnId = () => `mate-turn:${Date.now()}`
  }: PrepareMateTurnOptions = {}
): MateTurnResult {
  const request = mateTurnRequestSchema.parse(input);
  const generatedAt = now();
  const observations = observeRoom(request.context);
  const basedOn = {
    snapshotVersion: request.context.freshness.snapshotVersion,
    eventVersion: request.context.freshness.eventVersion,
    changedSinceSnapshot: request.context.freshness.changedSinceSnapshot,
    stale: request.context.freshness.changedSinceSnapshot
  };
  const uncertainty = describeUncertainty(request, observations, basedOn.stale);
  const interpretation = inferIntent(request, observations, uncertainty);
  const agentTurn = planAgentTurn({
    context: request.context,
    uncertainty,
    basedOn,
    ...(request.gateway ? { gateway: request.gateway } : {})
  });
  const id = turnId();
  const output = chooseOutput(
    request,
    observations,
    interpretation,
    agentTurn,
    basedOn,
    generatedAt,
    `${id}:output`
  );
  const selectedRuntime = selectMateAgentPath(request.gateway);

  memoryStore.recordTurn(request.roomId, {
    turnId: id,
    generatedAt,
    summary: summarizeTurn(observations, interpretation)
  });
  const memory = memoryStore.getDiagnostics(request.roomId);

  return mateTurnResultSchema.parse({
    schemaVersion: MATE_TURN_SCHEMA_VERSION,
    roomId: request.roomId,
    turnId: id,
    generatedAt,
    basedOn,
    observations,
    interpretation,
    agentTurn,
    uncertainty,
    output,
    runtime: createDeterministicRuntimeMetadata({
      ...selectedRuntime,
      reason: "Deterministic mate fallback is the default credential-free path."
    }),
    memory
  });
}

/**
 * 真实/假 agent 的异步入口。当前 server 仍可继续使用同步 `prepareMateTurn`；
 * 后续接 DeepSeek、流式 conversation 或结构化 AI Drop 时，从这里进入模型运行时。
 */
export async function prepareMateTurnWithRuntime(
  input: MateTurnRequest,
  options: PrepareMateTurnWithRuntimeOptions = {}
): Promise<MateTurnResult> {
  const request = mateTurnRequestSchema.parse(input);
  const fallback = prepareMateTurn(request, options);
  const selectedRuntime = selectMateAgentPath(request.gateway);
  const config =
    options.agentRuntime?.config ??
    options.runtimeConfig ??
    createMateAgentRuntimeConfig();

  if (config.mode === "deterministic") {
    return fallback;
  }

  if (config.mode === "real" && !config.provider.ready) {
    return withRuntimeMetadata(
      fallback,
      createSkippedRuntimeMetadata({
        config,
        ...selectedRuntime,
        reason:
          config.provider.reason ??
          "Real mate agent mode is unavailable because the provider is not ready."
      })
    );
  }

  if (!options.agentRuntime) {
    return withRuntimeMetadata(
      fallback,
      createSkippedRuntimeMetadata({
        config,
        ...selectedRuntime,
        reason: "No mate agent runtime adapter was provided."
      })
    );
  }

  const runtimeResult = await options.agentRuntime.run({
    ...selectedRuntime,
    roomId: request.roomId,
    ...(request.userMessage ? { userMessage: request.userMessage } : {}),
    ...(request.gateway ? { gateway: request.gateway } : {}),
    context: request.context,
    promptPack: createCanvasAgentPromptPack({
      ...(request.gateway ? { gateway: request.gateway } : {}),
      context: request.context,
      ...(request.userMessage ? { userMessage: request.userMessage } : {})
    }),
    fallback
  });
  const normalized = normalizeRuntimeAdapterResult({
    config,
    ...selectedRuntime,
    result: runtimeResult,
    roomId: request.roomId,
    outputId: `${fallback.turnId}:runtime-output`,
    createdAt: fallback.generatedAt,
    basedOn: fallback.basedOn
  });

  if (!normalized.ok) {
    return withRuntimeMetadata(fallback, normalized.runtime);
  }

  return mateTurnResultSchema.parse({
    ...fallback,
    ...(normalized.agentTurn ? { agentTurn: normalized.agentTurn } : {}),
    output: normalized.output,
    runtime: normalized.runtime
  });
}

/**
 * 把最新 room context feed 转成事实 observations。这个函数刻意不做解释，
 * 让后续逻辑能区分 mate 看到的事实和 mate 推断出的含义。
 */
function observeRoom(context: z.infer<typeof roomContextFeedSchema>) {
  const shapes = context.latestSnapshot?.document.shapes ?? [];
  return {
    shapeCount: context.latestSnapshot?.document.shapeCount ?? 0,
    shapeTypes: [...new Set(shapes.map((shape) => shape.type))],
    textSnippets: shapes
      .map((shape) => shape.text?.trim())
      .filter((text): text is string => Boolean(text))
      .slice(0, 8),
    selectedShapeIds:
      context.latestSnapshot?.selection.selectedShapeIds.map(String) ?? [],
    recentEventKinds: context.recentEvents.map((event) => event.kind)
  };
}

/**
 * 描述当前 turn 可能不完整或不适合直接行动的原因。
 */
function describeUncertainty(
  request: z.infer<typeof mateTurnRequestSchema>,
  observations: ReturnType<typeof observeRoom>,
  stale: boolean
) {
  const notes: string[] = [];
  if (observations.shapeCount === 0) {
    notes.push("Canvas appears empty or no snapshot content is available.");
  }
  if (!request.userMessage && request.mode !== "passive") {
    notes.push("No chat message was provided for this turn.");
  }
  if (stale) {
    notes.push("The canvas changed after the snapshot, so confirm before relying on this view.");
  }
  return notes;
}

/**
 * 根据消息文本、近期 room operations、selection 焦点和可见画布文本推断轻量用户意图。
 */
function inferIntent(
  request: z.infer<typeof mateTurnRequestSchema>,
  observations: ReturnType<typeof observeRoom>,
  uncertainty: string[]
) {
  const message = request.userMessage?.toLowerCase() ?? "";
  const signals: string[] = [];

  if (request.userMessage) {
    signals.push("user-message");
  }
  if (observations.recentEventKinds.includes("canvas-change")) {
    signals.push("recent-canvas-change");
  }
  if (observations.recentEventKinds.includes("selection-change")) {
    signals.push("selection-focus");
  }
  if (observations.textSnippets.length > 0) {
    signals.push("canvas-text");
  }

  if (observations.shapeCount === 0 && !request.userMessage) {
    return {
      intent: "unclear intent from an empty or quiet canvas",
      confidence: "low" as const,
      signals
    };
  }

  if (/organize|整理|cluster|group|structure/.test(message)) {
    return {
      intent: "organize existing canvas material",
      confidence: uncertainty.length > 0 ? ("medium" as const) : ("high" as const),
      signals
    };
  }

  if (/summarize|summary|总结/.test(message)) {
    return {
      intent: "summarize the current canvas state",
      confidence: uncertainty.length > 0 ? ("medium" as const) : ("high" as const),
      signals
    };
  }

  if (!request.userMessage && signals.includes("recent-canvas-change")) {
    return {
      intent: "recent canvas editing may benefit from a next-step suggestion",
      confidence: "medium" as const,
      signals
    };
  }

  return {
    intent: "offer general whiteboard assistance from visible context",
    confidence: uncertainty.length > 0 ? ("low" as const) : ("medium" as const),
    signals
  };
}

/**
 * 为当前 turn 选择结构化 AI 输出。
 *
 * 输出保持非变更。即使是 canvas action proposal，也只是纯数据；未来 executor
 * 执行前必须先经过 server/web 安全路径。
 */
function chooseOutput(
  request: z.infer<typeof mateTurnRequestSchema>,
  observations: ReturnType<typeof observeRoom>,
  interpretation: ReturnType<typeof inferIntent>,
  agentTurn: AgentTurnPlan,
  basedOn: MateTurnResult["basedOn"],
  createdAt: string,
  outputId: string
) {
  if (agentTurn.finalOutputKind === "completion-proposal") {
    return createCompletionProposalOutput(
      {
        roomId: request.roomId,
        context: request.context,
        agentTurn,
        basedOn,
        createdAt,
        outputId
      }
    );
  }

  if (agentTurn.finalOutputKind === "no-op-refusal") {
    return {
      schemaVersion: AGENT_OUTPUT_SCHEMA_VERSION,
      kind: "no-op" as const,
      outputId,
      roomId: request.roomId,
      createdAt,
      basedOn,
      reason: agentTurn.decision.reason,
      nonMutating: true as const
    };
  }

  if (
    agentTurn.finalOutputKind === "clarifying-question" &&
    request.gateway?.trigger.kind === "completion"
  ) {
    return {
      schemaVersion: AGENT_OUTPUT_SCHEMA_VERSION,
      kind: "question" as const,
      outputId,
      roomId: request.roomId,
      createdAt,
      basedOn,
      text: "I need a clearer recent authoring signal before suggesting a completion.",
      nonMutating: true as const
    };
  }

  if (isCreateNoteRequest(request.userMessage)) {
    const blocked = basedOn.stale;
    return agentOutputSchema.parse({
      schemaVersion: AGENT_OUTPUT_SCHEMA_VERSION,
      kind: "canvas-action-proposal",
      outputId,
      roomId: request.roomId,
      createdAt,
      basedOn,
      nonMutating: true,
      proposal: {
        proposalId: `${outputId}:proposal`,
        status: blocked ? "blocked" : "pending",
        statusReason: blocked
          ? "The canvas changed after the snapshot; refresh context before applying this proposal."
          : "Ready for explicit user review.",
        requiresAcceptance: true,
        action: {
          kind: "create-text-note",
          mutatesCanvas: true,
          text: createProposedNoteText(request.userMessage, observations),
          x: 120,
          y: 120
        },
        rationale:
          observations.textSnippets.length > 0
            ? "The current board has related notes, so a follow-up text note may help."
            : "The user explicitly asked to add a note."
      }
    });
  }

  if (basedOn.stale) {
    return {
      schemaVersion: AGENT_OUTPUT_SCHEMA_VERSION,
      kind: "question" as const,
      outputId,
      roomId: request.roomId,
      createdAt,
      basedOn,
      text:
        "I can help, but the board changed after the snapshot I saw. Want me to refresh context or continue from the latest visible facts?",
      nonMutating: true as const
    };
  }

  if (observations.shapeCount === 0) {
    return {
      schemaVersion: AGENT_OUTPUT_SCHEMA_VERSION,
      kind: "question" as const,
      outputId,
      roomId: request.roomId,
      createdAt,
      basedOn,
      text:
        "I do not see canvas content yet. What would you like to sketch, plan, or organize here?",
      nonMutating: true as const
    };
  }

  if (agentTurn.finalOutputKind === "conversation-answer") {
    return {
      schemaVersion: AGENT_OUTPUT_SCHEMA_VERSION,
      kind: "conversation-answer" as const,
      outputId,
      roomId: request.roomId,
      createdAt,
      basedOn,
      text: `Based on the board, I would ${interpretation.intent}.${
        observations.textSnippets.length > 0
          ? ` I see notes like: ${observations.textSnippets.join(", ")}.`
          : ""
      }`,
      nonMutating: true as const
    };
  }

  const textHint =
    observations.textSnippets.length > 0
      ? ` I see notes like: ${observations.textSnippets.join(", ")}.`
      : "";

  if (request.mode === "passive" || !request.userMessage) {
    return {
      schemaVersion: AGENT_OUTPUT_SCHEMA_VERSION,
      kind: "suggestion" as const,
      outputId,
      roomId: request.roomId,
      createdAt,
      basedOn,
      text: `A helpful next step could be to group related items and mark the open decision.${textHint}`,
      nonMutating: true as const
    };
  }

  return {
    schemaVersion: AGENT_OUTPUT_SCHEMA_VERSION,
    kind: "suggestion" as const,
    outputId,
    roomId: request.roomId,
    createdAt,
    basedOn,
    text: `Based on the board, I would ${interpretation.intent}.${textHint}`,
    nonMutating: true as const
  };
}

/**
 * 识别应该转成 typed create-text-note proposal 的用户请求。
 */
function isCreateNoteRequest(message: string | undefined) {
  return Boolean(
    message && /add|create|make|新增|添加|创建/i.test(message) && /note|text|节点|便签|备注/i.test(message)
  );
}

/**
 * 根据用户消息或当前画布文本片段，为 proposed note 生成有边界的文本。
 */
function createProposedNoteText(
  message: string | undefined,
  observations: ReturnType<typeof observeRoom>
) {
  if (message?.trim()) {
    return message.trim().slice(0, 160);
  }
  return observations.textSnippets[0]
    ? `Follow up: ${observations.textSnippets[0]}`
    : "Follow up note";
}

/**
 * 生成后续 diagnostics 保留的小型 memory 摘要。
 */
function summarizeTurn(
  observations: ReturnType<typeof observeRoom>,
  interpretation: ReturnType<typeof inferIntent>
) {
  return `${observations.shapeCount} shapes; intent: ${interpretation.intent}`;
}

/**
 * 读取某个 room 的 memory diagnostics，同时不暴露可变 memory 状态。
 */
export function getMemoryDiagnostics(
  memoryStore: RoomMemoryStore,
  roomId: string
): RoomMemoryDiagnostics {
  return memoryStore.getDiagnostics(roomId);
}

function withRuntimeMetadata(
  result: MateTurnResult,
  runtime: MateTurnResult["runtime"]
): MateTurnResult {
  return mateTurnResultSchema.parse({
    ...result,
    runtime
  });
}
