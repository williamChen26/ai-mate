import { completionProposalOutputSchema } from "@production-spec-graph/shared";

import {
  aiDropCompletionAgent,
  mateConversationAgent
} from "../mastra/agents/canvas-agents.js";
import {
  createMateAgentRuntimeConfig,
  type MateAgentPath,
  type MateAgentRuntimeAdapter,
  type MateAgentRuntimeConfig,
  type MateAgentRuntimeRequest,
  type MateAgentRuntimeResult,
  type MateAgentRuntimeToolCall
} from "./agent-runtime.js";

export type MastraRuntimeAgentLike = {
  generate: (messages: MastraRuntimeMessage[], options?: unknown) => Promise<unknown>;
};

export type MastraMateRuntimeAgents = {
  conversation: MastraRuntimeAgentLike;
  completion: MastraRuntimeAgentLike;
};

type MastraRuntimeMessage = {
  role: "user";
  content: string;
};

type MastraGenerateLike = {
  text?: unknown;
  object?: unknown;
  error?: unknown;
  toolCalls?: unknown;
  toolResults?: unknown;
};

const DEFAULT_REAL_MAX_STEPS = {
  conversation: 2,
  completion: 3
} as const;

/**
 * 根据环境创建真实 Mastra runtime adapter。只有 real 模式并且 DeepSeek ready 时
 * 才返回 adapter；默认测试/本地模式保持 undefined，让现有 fallback 继续工作。
 */
export function createConfiguredMastraMateAgentRuntimeAdapter(
  env: Partial<NodeJS.ProcessEnv> = process.env
): MateAgentRuntimeAdapter | undefined {
  const config = createMateAgentRuntimeConfig(env);
  if (config.mode !== "real" || !config.provider.ready) {
    return undefined;
  }
  return createMastraMateAgentRuntimeAdapter({ config });
}

/**
 * 创建真实 Mastra adapter。这个文件是唯一知道 Mastra `agent.generate()` 调用形态
 * 的边界，server 和 mate turn 仍只依赖 `MateAgentRuntimeAdapter` 小接口。
 */
export function createMastraMateAgentRuntimeAdapter({
  config,
  agents = {
    conversation: mateConversationAgent,
    completion: aiDropCompletionAgent
  }
}: {
  config?: MateAgentRuntimeConfig;
  agents?: MastraMateRuntimeAgents;
} = {}): MateAgentRuntimeAdapter {
  const runtimeConfig = config ?? createMateAgentRuntimeConfig();
  return {
    config: runtimeConfig,
    async run(request) {
      const agent = selectMastraAgent(agents, request.path);
      if (!agent) {
        return {
          ok: false,
          reason: `Mastra runtime does not handle ${request.path} path.`
        };
      }

      try {
        const result = asGenerateResult(
          await agent.generate(
            createMastraMessages(request),
            createMastraGenerateOptions(request)
          )
        );
        if (result.error) {
          return {
            ok: false,
            reason: boundedErrorReason(result.error),
            toolCalls: summarizeMastraToolCalls(result)
          };
        }
        return {
          ok: true,
          output: extractMastraOutput(result, request.path),
          toolCalls: summarizeMastraToolCalls(result),
          reason: `Mastra ${request.agentId} generated output.`
        };
      } catch (error) {
        return {
          ok: false,
          reason: boundedErrorReason(error)
        };
      }
    }
  };
}

function selectMastraAgent(
  agents: MastraMateRuntimeAgents,
  path: MateAgentPath
): MastraRuntimeAgentLike | null {
  if (path === "conversation") {
    return agents.conversation;
  }
  if (path === "completion") {
    return agents.completion;
  }
  return null;
}

/**
 * 构造本次 Mastra 调用的用户消息。prompt pack 已经把 canvas snapshot 和最近操作
 * 压缩成模型可读上下文，这里只额外写入输出 envelope 元数据，方便 completion
 * 直接返回可校验的 `agent-output.v1`。
 */
function createMastraMessages(request: MateAgentRuntimeRequest): MastraRuntimeMessage[] {
  const requiredOutputEnvelope = {
    outputId: `${request.fallback.turnId}:runtime-output`,
    roomId: request.roomId,
    createdAt: request.fallback.generatedAt,
    basedOn: request.fallback.basedOn
  };
  const content = [
    request.promptPack.system,
    request.promptPack.user,
    "Required output envelope metadata:",
    JSON.stringify(requiredOutputEnvelope, null, 2)
  ].join("\n\n");

  return [{ role: "user", content }];
}

/**
 * completion path 要求结构化输出；conversation path 保持普通 final text。这里不
 * 直接信任 provider，后面仍由 mate runtime normalizer 做最终 schema gate。
 */
function createMastraGenerateOptions(request: MateAgentRuntimeRequest) {
  const base = {
    maxSteps:
      request.path === "completion"
        ? DEFAULT_REAL_MAX_STEPS.completion
        : DEFAULT_REAL_MAX_STEPS.conversation
  };
  if (request.path !== "completion") {
    return base;
  }
  return {
    ...base,
    structuredOutput: {
      schema: completionProposalOutputSchema
    }
  };
}

function asGenerateResult(result: unknown): MastraGenerateLike {
  return isRecord(result) ? result : {};
}

function extractMastraOutput(
  result: MastraGenerateLike,
  path: MateAgentPath
): unknown {
  if (path === "completion") {
    if (result.object !== undefined && result.object !== null) {
      return result.object;
    }
    const parsed = parseJsonLikeText(result.text);
    return parsed.ok ? parsed.value : result.text;
  }
  return typeof result.text === "string" ? result.text : result.object;
}

/**
 * 将 Mastra/AI SDK 风格工具调用转成 mate runtime 的 bounded diagnostics。
 * 只保留名称、状态和输出类型，不保留工具参数正文或 prompt history。
 */
function summarizeMastraToolCalls(
  result: MastraGenerateLike
): MateAgentRuntimeToolCall[] {
  const calls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
  const results = Array.isArray(result.toolResults) ? result.toolResults : [];
  return calls
    .map((call): MateAgentRuntimeToolCall | null => {
      const toolName = readToolName(call);
      if (!toolName) {
        return null;
      }
      const matchingResult = results.find(
        (toolResult) => readToolName(toolResult) === toolName
      );
      const output = readToolResultOutput(matchingResult);
      const failed = isRecord(matchingResult) && "error" in matchingResult;
      return {
        toolName,
        status: failed ? "failed" : "called",
        ...(readOutputKind(output) ? { outputKind: readOutputKind(output) } : {}),
        ...(readPreviewOnly(call, output) === undefined
          ? {}
          : { previewOnly: readPreviewOnly(call, output) })
      };
    })
    .filter((toolCall): toolCall is MateAgentRuntimeToolCall => Boolean(toolCall))
    .slice(0, 12);
}

function readToolName(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const name = value.toolName ?? value.name;
  return typeof name === "string" && name.trim() ? name.trim().slice(0, 120) : null;
}

function readToolResultOutput(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }
  return value.result ?? value.output;
}

function readOutputKind(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return typeof value.kind === "string" ? value.kind.slice(0, 120) : undefined;
}

function readPreviewOnly(call: unknown, output: unknown): boolean | undefined {
  const callArgs = isRecord(call) && isRecord(call.args) ? call.args : null;
  if (typeof callArgs?.previewOnly === "boolean") {
    return callArgs.previewOnly;
  }
  if (isRecord(output) && isRecord(output.proposal)) {
    const previewOnly = output.proposal.previewOnly;
    return typeof previewOnly === "boolean" ? previewOnly : undefined;
  }
  return undefined;
}

function parseJsonLikeText(value: unknown):
  | { ok: true; value: unknown }
  | { ok: false } {
  if (typeof value !== "string") {
    return { ok: false };
  }
  const trimmed = value.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/u, "")
    .replace(/\s*```$/u, "");
  try {
    return { ok: true, value: JSON.parse(withoutFence) };
  } catch {
    return { ok: false };
  }
}

function boundedErrorReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim().slice(0, 500) || "Mastra runtime failed.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
