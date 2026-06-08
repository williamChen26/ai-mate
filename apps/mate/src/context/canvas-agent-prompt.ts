import {
  AGENT_OUTPUT_SCHEMA_VERSION,
  agentOutputSchema,
  type AgentOutput,
  type AgentOutputFreshness,
  type CanvasShapeSnapshot,
  type GatewayRequest,
  type RoomContextFeed,
  type RoomOperationEvent
} from "@production-spec-graph/shared";
import { z } from "zod";

import { selectMateAgentPath, type MateAgentPath } from "./agent-runtime.js";

export const CANVAS_AGENT_PROMPT_PACK_VERSION = "canvas-agent-prompt-pack.v1";

const DEFAULT_SHAPE_LIMIT = 24;
const DEFAULT_OPERATION_LIMIT = 25;
const TEXT_SNIPPET_LIMIT = 500;

export type CanvasAgentPromptPack = {
  schemaVersion: typeof CANVAS_AGENT_PROMPT_PACK_VERSION;
  path: MateAgentPath;
  roomId: string;
  system: string;
  user: string;
  context: {
    triggerKind: GatewayRequest["trigger"]["kind"] | "legacy";
    userMessage?: string;
    freshness: AgentOutputFreshness;
    selection: {
      selectedShapeIds: string[];
      selectedShapes: CanvasAgentShapeSummary[];
    };
    snapshot: {
      available: boolean;
      shapeCount: number;
      shapes: CanvasAgentShapeSummary[];
    };
    recentOperations: CanvasAgentOperationSummary[];
    safetyPolicy: string[];
  };
};

export type CanvasAgentShapeSummary = {
  id: string;
  type: string;
  text?: string;
  bounds?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
};

export type CanvasAgentOperationSummary = {
  index: number;
  kind: RoomOperationEvent["kind"];
  eventId: string;
  eventVersion: number;
  summary: string;
};

export type CreateCanvasAgentPromptPackInput = {
  gateway?: GatewayRequest;
  context: RoomContextFeed;
  userMessage?: string;
  shapeLimit?: number;
  operationLimit?: number;
};

export type NormalizeCanvasAgentOutputInput = {
  path: MateAgentPath;
  raw: unknown;
  roomId: string;
  outputId: string;
  createdAt: string;
  basedOn: AgentOutputFreshness;
};

export type NormalizedCanvasAgentOutput =
  | { ok: true; output: AgentOutput }
  | { ok: false; reason: string };

/**
 * 构造真实 agent 每一轮看到的 prompt/context 包。这里不是调用模型，而是把
 * tldraw 结构化事实翻译成“模型知道如何阅读”的说明，避免直接把裸 JSON 丢给 LLM。
 */
export function createCanvasAgentPromptPack(
  input: CreateCanvasAgentPromptPackInput
): CanvasAgentPromptPack {
  const selected = selectMateAgentPath(input.gateway);
  const snapshot = input.context.latestSnapshot;
  const shapes = (snapshot?.document.shapes ?? [])
    .slice(0, input.shapeLimit ?? DEFAULT_SHAPE_LIMIT)
    .map(summarizeShape);
  const selectedShapeIds =
    input.gateway?.trigger.kind === "completion" &&
    input.gateway.trigger.selection.state === "selected"
      ? input.gateway.trigger.selection.selectedShapeIds
      : snapshot?.selection.selectedShapeIds ?? [];
  const selectedShapes = shapes.filter((shape) =>
    selectedShapeIds.includes(shape.id)
  );
  const recentOperations = getPromptOperations(input)
    .slice(-(input.operationLimit ?? DEFAULT_OPERATION_LIMIT))
    .map(summarizeOperation);
  const freshness = {
    ...input.context.freshness,
    stale: input.context.freshness.changedSinceSnapshot
  };
  const triggerKind: CanvasAgentPromptPack["context"]["triggerKind"] =
    input.gateway?.trigger.kind ?? "legacy";
  const userMessage =
    input.userMessage ??
    (input.gateway?.trigger.kind === "conversation"
      ? input.gateway.trigger.message
      : undefined);
  const safetyPolicy = createSafetyPolicy(selected.path);
  const context = {
    triggerKind,
    ...(userMessage ? { userMessage } : {}),
    freshness,
    selection: {
      selectedShapeIds,
      selectedShapes
    },
    snapshot: {
      available: Boolean(snapshot),
      shapeCount: snapshot?.document.shapeCount ?? 0,
      shapes
    },
    recentOperations,
    safetyPolicy
  };

  return {
    schemaVersion: CANVAS_AGENT_PROMPT_PACK_VERSION,
    path: selected.path,
    roomId: input.context.roomId,
    system: createSystemPrompt(selected.path),
    user: createUserPrompt(context),
    context
  };
}

/**
 * 归一化模型输出。conversation 允许普通最终文本；AI Drop completion 必须是
 * schema 合法的 completion-proposal，防止半结构化文本误入 Tab 补全链路。
 */
export function normalizeCanvasAgentOutput(
  input: NormalizeCanvasAgentOutputInput
): NormalizedCanvasAgentOutput {
  if (typeof input.raw === "string") {
    const text = input.raw.trim();
    if (!text) {
      return { ok: false, reason: "empty-model-text" };
    }
    if (input.path !== "conversation") {
      return { ok: false, reason: "plain-text-not-supported-for-completion" };
    }
    return {
      ok: true,
      output: agentOutputSchema.parse({
        schemaVersion: AGENT_OUTPUT_SCHEMA_VERSION,
        kind: "conversation-answer",
        outputId: input.outputId,
        roomId: input.roomId,
        createdAt: input.createdAt,
        basedOn: input.basedOn,
        nonMutating: true,
        text
      })
    };
  }

  const fullOutput = agentOutputSchema.safeParse(input.raw);
  if (fullOutput.success) {
    return validateOutputForPath(fullOutput.data, input.path);
  }

  const partialConversation = z
    .object({
      kind: z.literal("conversation-answer"),
      text: z.string().trim().min(1).max(2_000)
    })
    .safeParse(input.raw);
  if (partialConversation.success && input.path === "conversation") {
    return {
      ok: true,
      output: agentOutputSchema.parse({
        schemaVersion: AGENT_OUTPUT_SCHEMA_VERSION,
        kind: "conversation-answer",
        outputId: input.outputId,
        roomId: input.roomId,
        createdAt: input.createdAt,
        basedOn: input.basedOn,
        nonMutating: true,
        text: partialConversation.data.text
      })
    };
  }

  return {
    ok: false,
    reason: fullOutput.error.issues.map((issue) => issue.message).join("; ")
  };
}

function validateOutputForPath(
  output: AgentOutput,
  path: MateAgentPath
): NormalizedCanvasAgentOutput {
  if (path === "completion" && output.kind !== "completion-proposal") {
    return {
      ok: false,
      reason: `unsupported-completion-output:${output.kind}`
    };
  }
  if (path === "conversation" && output.kind === "completion-proposal") {
    return {
      ok: false,
      reason: "completion-proposal-not-supported-for-conversation"
    };
  }
  return { ok: true, output };
}

function getPromptOperations(
  input: CreateCanvasAgentPromptPackInput
): RoomOperationEvent[] {
  if (input.gateway?.context.recentOperations.state === "available") {
    return input.gateway.context.recentOperations.operations;
  }
  if (input.gateway) {
    return [];
  }
  return input.context.recentEvents;
}

function summarizeShape(shape: CanvasShapeSnapshot): CanvasAgentShapeSummary {
  return {
    id: shape.id,
    type: shape.type,
    ...(shape.text
      ? { text: shape.text.trim().slice(0, TEXT_SNIPPET_LIMIT) }
      : {}),
    ...(shape.bounds ? { bounds: shape.bounds } : {})
  };
}

function summarizeOperation(
  event: RoomOperationEvent,
  index: number
): CanvasAgentOperationSummary {
  if (event.kind === "canvas-change") {
    return {
      index,
      kind: event.kind,
      eventId: event.eventId,
      eventVersion: event.eventVersion,
      summary: event.summary
    };
  }
  if (event.kind === "selection-change") {
    return {
      index,
      kind: event.kind,
      eventId: event.eventId,
      eventVersion: event.eventVersion,
      summary: `selection changed to ${event.selectedShapeIds.join(", ") || "empty"}`
    };
  }
  if (event.kind === "viewport-change") {
    return {
      index,
      kind: event.kind,
      eventId: event.eventId,
      eventVersion: event.eventVersion,
      summary: `viewport moved to x=${event.pageBounds.x}, y=${event.pageBounds.y}, zoom=${event.zoom}`
    };
  }
  return {
    index,
    kind: event.kind,
    eventId: event.eventId,
    eventVersion: event.eventVersion,
    summary: `chat boundary with message length ${event.messageLength}`
  };
}

function createSystemPrompt(path: MateAgentPath): string {
  const outputRule =
    path === "completion"
      ? "For AI Drop, return only a valid preview-only completion-proposal or decline."
      : "For conversation, answer normally; ordinary final answers are not tools.";

  return [
    "You are a room-aware AI coworker inside a collaborative tldraw canvas.",
    "The canvas is supplied as structured context, not as an image.",
    "Interpret shapes as current board state and recentOperations as ordered intent evidence.",
    "Selection is focus, not automatic proof of authoring intent.",
    "Never mutate the canvas directly or claim that a preview has been applied.",
    outputRule
  ].join("\n");
}

function createUserPrompt(context: CanvasAgentPromptPack["context"]): string {
  return JSON.stringify(
    {
      instructions:
        "Use this compact canvas context. Snapshot facts describe current state; recentOperations describe the user's recent trajectory.",
      context
    },
    null,
    2
  );
}

function createSafetyPolicy(path: MateAgentPath): string[] {
  return [
    "Do not directly mutate tldraw state.",
    "Respect freshness.stale and ask or decline when the context is unsafe.",
    "Use selected shapes as focus, but require recent operations for intent.",
    ...(path === "completion"
      ? [
          "AI Drop output must be a completion-proposal.",
          "Completion proposals must be previewOnly, require acceptance, and applied=false."
        ]
      : [
          "Conversation may answer with normal assistant text.",
          "Conversation must not activate AI Drop or create hidden proposals."
        ])
  ];
}
