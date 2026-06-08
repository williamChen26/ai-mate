import {
  mateTurnResultSchema,
  prepareMateTurn,
  prepareMateTurnWithRuntime,
  type MateTurnRequest,
  type MateTurnResult,
  type PrepareMateTurnOptions,
  type PrepareMateTurnWithRuntimeOptions
} from "mate/context";
import { createRoomMemoryStore, type RoomMemoryStore } from "mate/memory";
import { z } from "zod";

import {
  agentOutputSchema,
  boundsSchema,
  createGatewayRequest,
  type AgentOutput,
  type GatewayRequest,
  type RoomContextFeed
} from "@production-spec-graph/shared";

export type RoomMateErrorCode =
  | "INVALID_MATE_MESSAGE"
  | "INVALID_GATEWAY_REQUEST"
  | "INVALID_AGENT_OUTPUT"
  | "ROOM_MISMATCH"
  | "MATE_TURN_FAILED";

export type RoomMateError = {
  code: RoomMateErrorCode;
  message: string;
};

/**
 * server 侧成功 mate response envelope。它记录入站消息元数据、本次 turn 使用的
 * context freshness、output validation 状态，以及 raw mate 结果。
 */
export type RoomMateResponse = {
  roomId: string;
  agentSessionId?: string;
  message: {
    length: number;
    source: RoomMateMessageSource;
  };
  context: {
    freshness: RoomContextFeed["freshness"];
  };
  gateway: GatewayRequest;
  outputValidation: RoomMateOutputValidation;
  mate: MateTurnResult;
};

export type RoomMateFailureDiagnostics = {
  diagnosticKind: "failure";
  roomId: string;
  agentSessionId?: string;
  message: {
    length: number;
    source: RoomMateMessageSource;
  };
  context: {
    freshness: RoomContextFeed["freshness"];
  };
  gateway: GatewayRequest;
  outputValidation: RoomMateOutputValidation;
  error: RoomMateError;
  bounded: {
    storesRawAgentOutput: false;
    storesPromptText: false;
    storesFullPromptHistory: false;
  };
};

export type RoomMateDiagnosticRecord = RoomMateResponse | RoomMateFailureDiagnostics;

/**
 * mate output 的 server 侧校验摘要。server 可以接受格式正确的 proposal，
 * 但仍然拒绝自动应用。
 */
export type RoomMateOutputValidation = {
  ok: boolean;
  status: "none" | "pending" | "blocked" | "invalid";
  applied: false;
  reason?: string;
};

export type RoomMateResult =
  | { ok: true; response: RoomMateResponse }
  | { ok: false; error: RoomMateError };

export type RoomMateStreamEvent =
  | {
      kind: "started";
      roomId: string;
      triggerKind: GatewayRequest["trigger"]["kind"];
      runtime: MateTurnResult["runtime"] | null;
    }
  | {
      kind: "delta";
      roomId: string;
      text: string;
    }
  | {
      kind: "final";
      roomId: string;
      response: RoomMateResponse;
    }
  | {
      kind: "error";
      roomId: string;
      error: RoomMateError;
    };

export type RoomMateStreamResult =
  | { ok: true; events: RoomMateStreamEvent[]; response: RoomMateResponse }
  | { ok: false; events: RoomMateStreamEvent[]; error: RoomMateError };

export type RoomMateMessageSource = z.infer<typeof roomMateMessageSourceSchema>;

/**
 * Fastify routes 使用的 room 级 mate 编排服务。
 */
export type RoomMateService = {
  handleMessage: (input: {
    roomId: string;
    payload: unknown;
    context: RoomContextFeed;
    agent?: { agentSessionId?: string };
  }) => RoomMateResult;
  handleMessageAsync: (input: {
    roomId: string;
    payload: unknown;
    context: RoomContextFeed;
    agent?: { agentSessionId?: string };
  }) => Promise<RoomMateResult>;
  handleCompletionAsync: (input: {
    roomId: string;
    payload: unknown;
    context: RoomContextFeed;
    agent?: { agentSessionId?: string };
  }) => Promise<RoomMateResult>;
  streamMessage: (input: {
    roomId: string;
    payload: unknown;
    context: RoomContextFeed;
    agent?: { agentSessionId?: string };
  }) => Promise<RoomMateStreamResult>;
  getLastResponse: (roomId: string) => RoomMateResponse | undefined;
  getLastDiagnosticRecord: (roomId: string) => RoomMateDiagnosticRecord | undefined;
};

/**
 * 确定性测试和本地 smoke 运行所需的依赖注入点。
 */
export type RoomMateServiceOptions = {
  memoryStore?: RoomMemoryStore;
  now?: () => string;
  turnId?: () => string;
  prepareTurn?: (
    input: MateTurnRequest,
    options: { memoryStore: RoomMemoryStore; now: () => string; turnId: () => string }
  ) => unknown;
  prepareTurnAsync?: (
    input: MateTurnRequest,
    options: PrepareMateTurnWithRuntimeOptions & {
      memoryStore: RoomMemoryStore;
      now: () => string;
      turnId: () => string;
    }
  ) => Promise<unknown>;
  agentRuntime?: PrepareMateTurnWithRuntimeOptions["agentRuntime"];
  runtimeConfig?: PrepareMateTurnWithRuntimeOptions["runtimeConfig"];
};

const roomMateMessageSourceSchema = z.object({
  kind: z.literal("web"),
  deviceId: z.string().min(1).max(160),
  sessionId: z.string().min(1).max(220),
  tabId: z.string().min(1).max(160),
  sentAt: z.string().datetime()
});

const roomMateMessageSchema = z.object({
  message: z.string().trim().min(1).max(8_000),
  source: roomMateMessageSourceSchema
});

const roomMateCompletionSourceSchema = z.object({
  kind: z.literal("web"),
  deviceId: z.string().min(1).max(160),
  sessionId: z.string().min(1).max(220),
  tabId: z.string().min(1).max(160),
  capturedAt: z.string().datetime()
});

const roomMateCompletionSchema = z.object({
  selection: z.discriminatedUnion("state", [
    z.object({
      state: z.literal("selected"),
      selectedShapeIds: z.array(z.string().min(1).max(220)).min(1).max(2_000)
    }),
    z.object({
      state: z.literal("empty"),
      selectedShapeIds: z.array(z.string().min(1).max(220)).max(0).default([])
    }),
    z.object({
      state: z.literal("none"),
      reason: z.string().min(1).max(500)
    })
  ]),
  viewport: z.discriminatedUnion("state", [
    z.object({
      state: z.literal("available"),
      pageBounds: boundsSchema,
      zoom: z.number().finite().positive()
    }),
    z.object({
      state: z.literal("missing"),
      reason: z.string().min(1).max(500)
    })
  ]),
  source: roomMateCompletionSourceSchema
});

/**
 * 创建 server 侧 mate service。
 *
 * 该服务会校验 web message，确认 room context 属于同一个路由 room，调用 mate turn
 * 边界，校验 agent output，并为 raw diagnostics 保存每个 room 的最新 response。
 */
export function createRoomMateService({
  memoryStore = createRoomMemoryStore(),
  now = () => new Date().toISOString(),
  turnId = () => `mate-turn:${Date.now()}`,
  prepareTurn = prepareMateTurn,
  prepareTurnAsync = prepareMateTurnWithRuntime,
  agentRuntime,
  runtimeConfig
}: RoomMateServiceOptions = {}): RoomMateService {
  const lastResponses = new Map<string, RoomMateResponse>();
  const lastDiagnosticRecords = new Map<string, RoomMateDiagnosticRecord>();

  return {
    handleMessage({ roomId, payload, context, agent }) {
      const prepared = prepareRoomMateInvocation({
        roomId,
        payload,
        context,
        now
      });
      if (!prepared.ok) {
        return prepared;
      }

      try {
        // 同步兼容路径：保留 deterministic `prepareMateTurn` 给旧测试和 smoke 使用。
        const rawMate = prepareTurn(
          {
            roomId,
            userMessage: prepared.message.message,
            gateway: prepared.gateway,
            context
          },
          { memoryStore, now, turnId }
        );
        return storeMateTurnResult({
          roomId,
          ...(agent ? { agent } : {}),
          message: {
            length: prepared.message.message.length,
            source: prepared.message.source
          },
          context,
          gateway: prepared.gateway,
          rawMate,
          lastResponses,
          lastDiagnosticRecords
        });
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "MATE_TURN_FAILED",
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    },

    async handleMessageAsync({ roomId, payload, context, agent }) {
      const prepared = prepareRoomMateInvocation({
        roomId,
        payload,
        context,
        now
      });
      if (!prepared.ok) {
        return prepared;
      }

      try {
        // 异步产品路径：这里可以进入 fake/real Mastra runtime；没有配置时仍安全回落。
        const rawMate = await prepareTurnAsync(
          {
            roomId,
            userMessage: prepared.message.message,
            gateway: prepared.gateway,
            context
          },
          {
            memoryStore,
            now,
            turnId,
            ...(agentRuntime ? { agentRuntime } : {}),
            ...(runtimeConfig ? { runtimeConfig } : {})
          }
        );
        return storeMateTurnResult({
          roomId,
          ...(agent ? { agent } : {}),
          message: {
            length: prepared.message.message.length,
            source: prepared.message.source
          },
          context,
          gateway: prepared.gateway,
          rawMate,
          lastResponses,
          lastDiagnosticRecords
        });
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "MATE_TURN_FAILED",
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    },

    async handleCompletionAsync({ roomId, payload, context, agent }) {
      const prepared = prepareRoomMateCompletionInvocation({
        roomId,
        payload,
        context,
        now
      });
      if (!prepared.ok) {
        return prepared;
      }

      try {
        // AI Drop completion 专用路径：这里的 gateway trigger 是 completion，
        // 输出必须由 mate runtime 收束为 completion-proposal 才能被 web 预览。
        const rawMate = await prepareTurnAsync(
          {
            roomId,
            gateway: prepared.gateway,
            context
          },
          {
            memoryStore,
            now,
            turnId,
            ...(agentRuntime ? { agentRuntime } : {}),
            ...(runtimeConfig ? { runtimeConfig } : {})
          }
        );
        return storeMateTurnResult({
          roomId,
          ...(agent ? { agent } : {}),
          message: {
            length: 0,
            source: completionSourceToMessageSource(prepared.completion.source)
          },
          context,
          gateway: prepared.gateway,
          rawMate,
          lastResponses,
          lastDiagnosticRecords
        });
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "MATE_TURN_FAILED",
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    },

    async streamMessage(input) {
      const result = await this.handleMessageAsync(input);
      if (!result.ok) {
        return {
          ok: false,
          events: [
            {
              kind: "error",
              roomId: input.roomId,
              error: result.error
            }
          ],
          error: result.error
        };
      }
      const text = getConversationStreamText(result.response.mate.output);
      const events: RoomMateStreamEvent[] = [
        {
          kind: "started",
          roomId: input.roomId,
          triggerKind: result.response.gateway.trigger.kind,
          runtime: result.response.mate.runtime
        },
        ...chunkStreamText(text).map((chunk) => ({
          kind: "delta" as const,
          roomId: input.roomId,
          text: chunk
        })),
        {
          kind: "final",
          roomId: input.roomId,
          response: result.response
        }
      ];
      return { ok: true, events, response: result.response };
    },

    getLastResponse(roomId) {
      return lastResponses.get(roomId);
    },

    getLastDiagnosticRecord(roomId) {
      return lastDiagnosticRecords.get(roomId);
    }
  };
}

function prepareRoomMateCompletionInvocation({
  roomId,
  payload,
  context,
  now
}: {
  roomId: string;
  payload: unknown;
  context: RoomContextFeed;
  now: () => string;
}):
  | {
      ok: true;
      completion: z.infer<typeof roomMateCompletionSchema>;
      gateway: GatewayRequest;
    }
  | { ok: false; error: RoomMateError } {
  const parsed = roomMateCompletionSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "INVALID_MATE_MESSAGE",
        message: parsed.error.issues.map((issue) => issue.message).join("; ")
      }
    };
  }
  if (context.roomId !== roomId) {
    return {
      ok: false,
      error: {
        code: "ROOM_MISMATCH",
        message: `Context room id ${context.roomId} does not match route room id ${roomId}.`
      }
    };
  }

  const gatewayResult = safeCreateGatewayRequest(() =>
    createGatewayRequest({
      requestId: `gateway:${roomId}:completion:${parsed.data.source.capturedAt}`,
      roomId,
      createdAt: now(),
      trigger: {
        kind: "completion",
        invokedBy: "ai-drop",
        selection:
          parsed.data.selection.state === "selected"
            ? {
                ...parsed.data.selection,
                source: {
                  origin: "front-end-runtime-signal",
                  source: parsed.data.source
                }
              }
            : parsed.data.selection,
        viewport:
          parsed.data.viewport.state === "available"
            ? {
                ...parsed.data.viewport,
                source: {
                  origin: "front-end-runtime-signal",
                  source: parsed.data.source
                }
              }
            : parsed.data.viewport,
        source: parsed.data.source
      },
      context
    })
  );
  if (!gatewayResult.ok) {
    return gatewayResult;
  }

  return {
    ok: true,
    completion: parsed.data,
    gateway: gatewayResult.gateway
  };
}

function completionSourceToMessageSource(
  source: z.infer<typeof roomMateCompletionSourceSchema>
): RoomMateMessageSource {
  return {
    kind: "web",
    deviceId: source.deviceId,
    sessionId: source.sessionId,
    tabId: source.tabId,
    sentAt: source.capturedAt
  };
}

function prepareRoomMateInvocation({
  roomId,
  payload,
  context,
  now
}: {
  roomId: string;
  payload: unknown;
  context: RoomContextFeed;
  now: () => string;
}):
  | { ok: true; message: z.infer<typeof roomMateMessageSchema>; gateway: GatewayRequest }
  | { ok: false; error: RoomMateError } {
  const parsed = roomMateMessageSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "INVALID_MATE_MESSAGE",
        message: parsed.error.issues.map((issue) => issue.message).join("; ")
      }
    };
  }
  if (context.roomId !== roomId) {
    return {
      ok: false,
      error: {
        code: "ROOM_MISMATCH",
        message: `Context room id ${context.roomId} does not match route room id ${roomId}.`
      }
    };
  }

  // gateway 是 server -> AI 的入口合同：raw mate message 先被标记为
  // conversation trigger，并携带 server feed 中的 snapshot 与有界操作栈。
  const gatewayResult = safeCreateGatewayRequest(() =>
    createGatewayRequest({
      requestId: `gateway:${roomId}:${parsed.data.source.sentAt}`,
      roomId,
      createdAt: now(),
      trigger: {
        kind: "conversation",
        message: parsed.data.message,
        chatBoundary: {
          state: "missing",
          reason:
            "No chat-boundary event was present in the bounded server context feed."
        },
        source: parsed.data.source
      },
      context
    })
  );
  if (!gatewayResult.ok) {
    return gatewayResult;
  }

  return {
    ok: true,
    message: parsed.data,
    gateway: gatewayResult.gateway
  };
}

function storeMateTurnResult({
  roomId,
  agent,
  message,
  context,
  gateway,
  rawMate,
  lastResponses,
  lastDiagnosticRecords
}: {
  roomId: string;
  agent?: { agentSessionId?: string };
  message: {
    length: number;
    source: RoomMateMessageSource;
  };
  context: RoomContextFeed;
  gateway: GatewayRequest;
  rawMate: unknown;
  lastResponses: Map<string, RoomMateResponse>;
  lastDiagnosticRecords: Map<string, RoomMateDiagnosticRecord>;
}): RoomMateResult {
  const parsedMate = mateTurnResultSchema.safeParse(rawMate);
  if (!parsedMate.success) {
    const reason = parsedMate.error.issues
      .map((issue) => issue.message)
      .join("; ");
    lastDiagnosticRecords.set(roomId, {
      diagnosticKind: "failure",
      roomId,
      ...(agent?.agentSessionId ? { agentSessionId: agent.agentSessionId } : {}),
      message: {
        length: message.length,
        source: message.source
      },
      context: {
        freshness: context.freshness
      },
      gateway,
      outputValidation: {
        ok: false,
        status: "invalid",
        applied: false,
        reason
      },
      error: {
        code: "INVALID_AGENT_OUTPUT",
        message: reason
      },
      bounded: {
        storesRawAgentOutput: false,
        storesPromptText: false,
        storesFullPromptHistory: false
      }
    });
    return {
      ok: false,
      error: {
        code: "INVALID_AGENT_OUTPUT",
        message: reason
      }
    };
  }
  const mate = parsedMate.data;
  const outputValidation = validateOutput(mate.output, context);
  const response: RoomMateResponse = {
    roomId,
    ...(agent?.agentSessionId ? { agentSessionId: agent.agentSessionId } : {}),
    message: {
      length: message.length,
      source: message.source
    },
    context: {
      freshness: context.freshness
    },
    gateway,
    outputValidation,
    mate
  };
  lastResponses.set(roomId, response);
  lastDiagnosticRecords.set(roomId, response);
  return { ok: true, response };
}

/**
 * 单独归类 gateway contract 构造错误，避免把协议错误误报成 mate 执行失败。
 */
function safeCreateGatewayRequest(
  build: () => GatewayRequest
): { ok: true; gateway: GatewayRequest } | { ok: false; error: RoomMateError } {
  try {
    return { ok: true, gateway: build() };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: {
          code: "INVALID_GATEWAY_REQUEST",
          message: error.issues.map((issue) => issue.message).join("; ")
        }
      };
    }
    throw error;
  }
}

/**
 * 校验 mate 返回的结构化 output，并映射成安全的 server 状态。这里永远不应用
 * proposal；过期 proposal 会被标记为 blocked。
 */
function validateOutput(
  output: AgentOutput,
  context: RoomContextFeed
): RoomMateOutputValidation {
  const parsed = agentOutputSchema.safeParse(output);
  if (!parsed.success) {
    return {
      ok: false,
      status: "invalid",
      applied: false,
      reason: parsed.error.issues.map((issue) => issue.message).join("; ")
    };
  }

  if (parsed.data.kind !== "canvas-action-proposal") {
    return {
      ok: true,
      status: "none",
      applied: false
    };
  }

  if (context.freshness.changedSinceSnapshot || parsed.data.basedOn.stale) {
    return {
      ok: true,
      status: "blocked",
      applied: false,
      reason:
        parsed.data.proposal.statusReason ??
        "The canvas changed after the snapshot; refresh context before applying this proposal."
    };
  }

  return {
    ok: true,
    status: parsed.data.proposal.status,
    applied: false,
    ...(parsed.data.proposal.statusReason
      ? { reason: parsed.data.proposal.statusReason }
      : {})
  };
}

function getConversationStreamText(output: AgentOutput): string {
  if (output.kind === "conversation-answer" || output.kind === "question") {
    return output.text;
  }
  if (output.kind === "suggestion") {
    return output.text;
  }
  if (output.kind === "no-op") {
    return output.reason;
  }
  if (output.kind === "canvas-action-proposal") {
    return output.proposal.rationale;
  }
  return output.proposal.rationale;
}

function chunkStreamText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  const chunks = trimmed.match(/.{1,80}(\s|$)/g)?.map((chunk) => chunk.trim()) ?? [
    trimmed
  ];
  return chunks.filter(Boolean);
}
