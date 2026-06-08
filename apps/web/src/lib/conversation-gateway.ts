import {
  agentOutputSchema,
  gatewayIntentReadinessSchema,
  gatewayFreshnessSchema,
  type AgentOutput,
  type GatewayFreshness
} from "@production-spec-graph/shared";

export type ConversationGatewayStatus =
  | "idle"
  | "pending"
  | "success"
  | "context-stale"
  | "context-incomplete"
  | "unsupported-output"
  | "error";

export type ConversationGatewayState = {
  status: ConversationGatewayStatus;
  text?: string;
  error?: string;
  outputKind?: string;
  triggerKind?: string;
  freshnessState?: "fresh" | "stale";
  readinessState?: "ready" | "stale" | "incomplete";
  missingContext?: string[];
  raw?: unknown;
};

type RawMateSuccessEnvelope = {
  ok: true;
  response: {
    gateway?: {
      trigger?: { kind?: unknown };
      context?: {
        freshness?: unknown;
        intentReadiness?: unknown;
      };
    };
    mate?: {
      output?: unknown;
      agentTurn?: {
        finalOutputKind?: unknown;
      };
    };
  };
};

type RawMateFailureEnvelope = {
  ok: false;
  error?: {
    message?: unknown;
    code?: unknown;
  };
};

/**
 * 创建 conversation gateway 的基础状态。它把空消息、pending 和网络错误这种
 * UI 状态统一成同一种可测试形态，避免 React 组件里散落字符串判断。
 */
export function createConversationGatewayState(
  kind: "idle" | "pending" | "empty-message" | "error",
  error?: string
): ConversationGatewayState {
  if (kind === "empty-message") {
    return { status: "error", error: "Message is required." };
  }
  if (kind === "error") {
    return { status: "error", error: error ?? "Conversation request failed." };
  }
  return { status: kind };
}

/**
 * 将 server 返回的 raw mate envelope 分类成 conversation 可展示状态。这里是
 * 对话入口和 AI Drop 的隔离边界：completion-proposal 在这里会被隔离为
 * unsupported-output，不会被转发给 AI Drop runtime。
 */
export function classifyConversationGatewayResponse(
  value: unknown
): ConversationGatewayState {
  if (isFailureEnvelope(value)) {
    return {
      status: "error",
      error:
        typeof value.error?.message === "string"
          ? value.error.message
          : "Conversation request failed.",
      raw: value
    };
  }

  if (!isSuccessEnvelope(value)) {
    return { status: "error", error: "Malformed mate response.", raw: value };
  }

  const outputResult = agentOutputSchema.safeParse(value.response.mate?.output);
  if (!outputResult.success) {
    return {
      status: "error",
      error: "Malformed agent output.",
      raw: value
    };
  }

  const output = outputResult.data;
  const triggerKind = readTriggerKind(value);
  const freshness = readFreshness(value);
  const readiness = readReadiness(value);
  const base: Partial<ConversationGatewayState> = {
    outputKind: output.kind,
    freshnessState: freshness?.stale ? "stale" : "fresh",
    readinessState: readiness?.state ?? "ready",
    missingContext: readiness?.missing ?? [],
    raw: value
  };
  if (triggerKind) {
    base.triggerKind = triggerKind;
  }

  if (output.kind === "completion-proposal") {
    return {
      ...base,
      status: "unsupported-output",
      error: "Completion proposals are only accepted by AI Drop."
    };
  }

  const text = getOutputText(output);
  const status = getContextualStatus(base);

  return {
    ...base,
    status,
    text
  };
}

/**
 * 从分类后的状态里取对话可见文本。UI 使用它可以不关心 answer/question/no-op
 * 的字段差异。
 */
export function getConversationOutputText(
  state: ConversationGatewayState
): string | null {
  return state.text ?? state.error ?? null;
}

function isFailureEnvelope(value: unknown): value is RawMateFailureEnvelope {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { ok?: unknown }).ok === false
  );
}

function isSuccessEnvelope(value: unknown): value is RawMateSuccessEnvelope {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { ok?: unknown }).ok === true &&
      typeof (value as { response?: unknown }).response === "object" &&
      (value as { response?: unknown }).response
  );
}

function readTriggerKind(value: RawMateSuccessEnvelope) {
  const kind = value.response.gateway?.trigger?.kind;
  return typeof kind === "string" ? kind : undefined;
}

function readFreshness(value: RawMateSuccessEnvelope): GatewayFreshness | null {
  const raw = value.response.gateway?.context?.freshness;
  const parsed = gatewayFreshnessSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function readReadiness(value: RawMateSuccessEnvelope) {
  const raw = value.response.gateway?.context?.intentReadiness;
  const parsed = gatewayIntentReadinessSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function getContextualStatus(
  state: Partial<ConversationGatewayState>
): ConversationGatewayStatus {
  if (state.freshnessState === "stale" || state.readinessState === "stale") {
    return "context-stale";
  }
  if (state.readinessState === "incomplete") {
    return "context-incomplete";
  }
  return "success";
}

function getOutputText(output: AgentOutput): string {
  if (output.kind === "no-op") {
    return output.reason;
  }
  if (output.kind === "canvas-action-proposal") {
    return output.proposal.rationale;
  }
  if (output.kind === "completion-proposal") {
    return output.proposal.rationale;
  }
  return output.text;
}
