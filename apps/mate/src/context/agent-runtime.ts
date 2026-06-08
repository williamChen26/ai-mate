import {
  type AgentOutput,
  type GatewayRequest,
  type RoomContextFeed
} from "@production-spec-graph/shared";
import { z } from "zod";

import type { AgentTurnPlan } from "./agent-turn.js";
import { normalizeCanvasAgentOutput } from "./canvas-agent-prompt.js";
import type { CanvasAgentPromptPack } from "./canvas-agent-prompt.js";
import type { MateTurnResult } from "./mate-turn.js";

export const mateAgentRuntimeModeSchema = z.enum([
  "deterministic",
  "fake",
  "real"
]);

export const mateAgentPathSchema = z.enum(["conversation", "completion", "legacy"]);

export const mateAgentIdSchema = z.enum([
  "mate-conversation-agent",
  "ai-drop-completion-agent",
  "deterministic-mate"
]);

export const mateProviderReadinessSchema = z.object({
  provider: z.literal("deepseek"),
  ready: z.boolean(),
  reason: z.string().min(1).max(500).optional()
});

export const mateAgentRuntimeToolCallSchema = z.object({
  toolName: z.string().min(1).max(120),
  status: z.enum(["called", "skipped", "failed"]),
  outputKind: z.string().min(1).max(120).optional(),
  previewOnly: z.boolean().optional(),
  reason: z.string().min(1).max(500).optional()
});

export const mateAgentRuntimeMetadataSchema = z.object({
  mode: mateAgentRuntimeModeSchema,
  path: mateAgentPathSchema,
  agentId: mateAgentIdSchema,
  outputSource: z.enum([
    "deterministic-fallback",
    "fake-agent",
    "real-agent"
  ]),
  status: z.enum(["used", "skipped", "failed"]),
  fallbackUsed: z.boolean(),
  provider: mateProviderReadinessSchema.optional(),
  toolCallCount: z.number().int().nonnegative(),
  toolCalls: z.array(mateAgentRuntimeToolCallSchema).max(12),
  reason: z.string().min(1).max(1_000).optional()
});

export type MateAgentRuntimeMode = z.infer<typeof mateAgentRuntimeModeSchema>;
export type MateAgentPath = z.infer<typeof mateAgentPathSchema>;
export type MateAgentId = z.infer<typeof mateAgentIdSchema>;
export type MateProviderReadiness = z.infer<typeof mateProviderReadinessSchema>;
export type MateAgentRuntimeToolCall = z.infer<
  typeof mateAgentRuntimeToolCallSchema
>;
export type MateAgentRuntimeMetadata = z.infer<
  typeof mateAgentRuntimeMetadataSchema
>;

export type MateAgentRuntimeConfig = {
  mode: MateAgentRuntimeMode;
  provider: MateProviderReadiness;
};

export type MateAgentRuntimeRequest = {
  path: MateAgentPath;
  agentId: MateAgentId;
  roomId: string;
  userMessage?: string;
  gateway?: GatewayRequest;
  context: RoomContextFeed;
  promptPack: CanvasAgentPromptPack;
  fallback: MateTurnResult;
};

export type MateAgentRuntimeResult =
  | {
      ok: true;
      output: unknown;
      agentTurn?: AgentTurnPlan;
      toolCalls?: MateAgentRuntimeToolCall[];
      reason?: string;
    }
  | {
      ok: false;
      reason: string;
      toolCalls?: MateAgentRuntimeToolCall[];
    };

export type MateAgentRuntimeAdapter = {
  config: MateAgentRuntimeConfig;
  run: (request: MateAgentRuntimeRequest) => Promise<MateAgentRuntimeResult>;
};

/**
 * 从环境变量读取 mate agent 运行模式。默认保持 deterministic，保证没有
 * DeepSeek key 时测试、build 和 smoke 都不会被外部模型阻塞。
 */
export function createMateAgentRuntimeConfig(
  env: Partial<NodeJS.ProcessEnv> = process.env
): MateAgentRuntimeConfig {
  const parsedMode = mateAgentRuntimeModeSchema.safeParse(env.MATE_AGENT_MODE);
  const mode = parsedMode.success ? parsedMode.data : "deterministic";
  const hasDeepSeekKey = Boolean(env.DEEPSEEK_API_KEY?.trim());
  return {
    mode,
    provider: {
      provider: "deepseek",
      ready: mode === "real" ? hasDeepSeekKey : false,
      ...(mode === "real" && !hasDeepSeekKey
        ? { reason: "DEEPSEEK_API_KEY is required for real mate agent mode." }
        : mode !== "real"
          ? { reason: "Provider is not required unless MATE_AGENT_MODE=real." }
          : {})
    }
  };
}

/**
 * 根据 gateway trigger 选择产品 agent 路径。大路由由代码决定，避免模型把
 * conversation 和 AI Drop 两条产品通道混在一起。
 */
export function selectMateAgentPath(gateway?: GatewayRequest): {
  path: MateAgentPath;
  agentId: MateAgentId;
} {
  if (gateway?.trigger.kind === "conversation") {
    return { path: "conversation", agentId: "mate-conversation-agent" };
  }
  if (gateway?.trigger.kind === "completion") {
    return { path: "completion", agentId: "ai-drop-completion-agent" };
  }
  return { path: "legacy", agentId: "deterministic-mate" };
}

/**
 * deterministic `prepareMateTurn` 使用的运行时元数据。它明确告诉 diagnostics：
 * 这次结果来自本地 fallback，而不是假装已经调用了真实模型。
 */
export function createDeterministicRuntimeMetadata(input: {
  path: MateAgentPath;
  agentId: MateAgentId;
  reason?: string;
}): MateAgentRuntimeMetadata {
  return mateAgentRuntimeMetadataSchema.parse({
    mode: "deterministic",
    path: input.path,
    agentId: input.agentId,
    outputSource: "deterministic-fallback",
    status: "used",
    fallbackUsed: true,
    toolCallCount: 0,
    toolCalls: [],
    ...(input.reason ? { reason: input.reason } : {})
  });
}

/**
 * 描述真实/假 agent 没有运行时的 fallback。这个函数只生成元数据，不改变
 * fallback output，便于测试定位“为什么没有走模型”。
 */
export function createSkippedRuntimeMetadata(input: {
  config: MateAgentRuntimeConfig;
  path: MateAgentPath;
  agentId: MateAgentId;
  reason: string;
}): MateAgentRuntimeMetadata {
  return mateAgentRuntimeMetadataSchema.parse({
    mode: input.config.mode,
    path: input.path,
    agentId: input.agentId,
    outputSource: "deterministic-fallback",
    status: "skipped",
    fallbackUsed: true,
    provider: input.config.provider,
    toolCallCount: 0,
    toolCalls: [],
    reason: input.reason
  });
}

/**
 * 将 adapter 的输出收束成 mate turn 可存储的运行时结果。这里再次校验
 * agent-output.v1，是为了防止真实模型或 fake adapter 绕过共享协议。
 */
export function normalizeRuntimeAdapterResult(input: {
  config: MateAgentRuntimeConfig;
  path: MateAgentPath;
  agentId: MateAgentId;
  result: MateAgentRuntimeResult;
  roomId: string;
  outputId: string;
  createdAt: string;
  basedOn: MateTurnResult["basedOn"];
}):
  | {
      ok: true;
      output: AgentOutput;
      agentTurn?: AgentTurnPlan;
      runtime: MateAgentRuntimeMetadata;
    }
  | { ok: false; runtime: MateAgentRuntimeMetadata } {
  if (!input.result.ok) {
    return {
      ok: false,
      runtime: createFailedRuntimeMetadata({
        config: input.config,
        path: input.path,
        agentId: input.agentId,
        reason: input.result.reason,
        ...(input.result.toolCalls ? { toolCalls: input.result.toolCalls } : {})
      })
    };
  }

  const normalized = normalizeCanvasAgentOutput({
    path: input.path,
    raw: input.result.output,
    roomId: input.roomId,
    outputId: input.outputId,
    createdAt: input.createdAt,
    basedOn: input.basedOn
  });
  if (!normalized.ok) {
    return {
      ok: false,
      runtime: createFailedRuntimeMetadata({
        config: input.config,
        path: input.path,
        agentId: input.agentId,
        reason: normalized.reason,
        ...(input.result.toolCalls ? { toolCalls: input.result.toolCalls } : {})
      })
    };
  }

  const toolCalls = normalizeRuntimeToolCalls(input.result.toolCalls);
  return {
    ok: true,
    output: normalized.output,
    ...(input.result.agentTurn ? { agentTurn: input.result.agentTurn } : {}),
    runtime: mateAgentRuntimeMetadataSchema.parse({
      mode: input.config.mode,
      path: input.path,
      agentId: input.agentId,
      outputSource: input.config.mode === "fake" ? "fake-agent" : "real-agent",
      status: "used",
      fallbackUsed: false,
      provider: input.config.provider,
      toolCallCount: toolCalls.length,
      toolCalls,
      ...(input.result.reason ? { reason: input.result.reason } : {})
    })
  };
}

function createFailedRuntimeMetadata(input: {
  config: MateAgentRuntimeConfig;
  path: MateAgentPath;
  agentId: MateAgentId;
  reason: string;
  toolCalls?: MateAgentRuntimeToolCall[];
}): MateAgentRuntimeMetadata {
  const toolCalls = normalizeRuntimeToolCalls(input.toolCalls);
  return mateAgentRuntimeMetadataSchema.parse({
    mode: input.config.mode,
    path: input.path,
    agentId: input.agentId,
    outputSource: "deterministic-fallback",
    status: "failed",
    fallbackUsed: true,
    provider: input.config.provider,
    toolCallCount: toolCalls.length,
    toolCalls,
    reason: input.reason
  });
}

/**
 * 将 adapter 上报的工具调用压成 bounded diagnostics。这里不保留工具入参、
 * prompt 或原始模型消息，只留下排查 ReAct 流程所需的最小事实。
 */
function normalizeRuntimeToolCalls(
  toolCalls: MateAgentRuntimeToolCall[] | undefined
) {
  return (toolCalls ?? [])
    .map((toolCall) => mateAgentRuntimeToolCallSchema.safeParse(toolCall))
    .filter((result): result is { success: true; data: MateAgentRuntimeToolCall } =>
      Boolean(result.success)
    )
    .map((result) => result.data)
    .slice(0, 12);
}
