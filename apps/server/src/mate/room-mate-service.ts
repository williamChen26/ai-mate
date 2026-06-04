import {
  mateTurnResultSchema,
  prepareMateTurn,
  type MateTurnRequest,
  type MateTurnResult
} from "mate/context";
import { createRoomMemoryStore, type RoomMemoryStore } from "mate/memory";
import { z } from "zod";

import {
  agentOutputSchema,
  type AgentOutput,
  type RoomContextFeed
} from "@production-spec-graph/shared";

export type RoomMateErrorCode =
  | "INVALID_MATE_MESSAGE"
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
  outputValidation: RoomMateOutputValidation;
  mate: MateTurnResult;
};

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
  getLastResponse: (roomId: string) => RoomMateResponse | undefined;
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
  prepareTurn = prepareMateTurn
}: RoomMateServiceOptions = {}): RoomMateService {
  const lastResponses = new Map<string, RoomMateResponse>();

  return {
    handleMessage({ roomId, payload, context, agent }) {
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

      try {
        // 这里是当前“发给 AI”的边界：把用户消息和 server 当前 room context feed
        // 一起传给 apps/mate。当前 prepareTurn 是确定性逻辑，不会调用外部 LLM。
        const rawMate = prepareTurn(
          {
            roomId,
            userMessage: parsed.data.message,
            context
          },
          { memoryStore, now, turnId }
        );
        const parsedMate = mateTurnResultSchema.safeParse(rawMate);
        if (!parsedMate.success) {
          return {
            ok: false,
            error: {
              code: "INVALID_AGENT_OUTPUT",
              message: parsedMate.error.issues
                .map((issue) => issue.message)
                .join("; ")
            }
          };
        }
        const mate = parsedMate.data;
        const outputValidation = validateOutput(mate.output, context);
        const response: RoomMateResponse = {
          roomId,
          ...(agent?.agentSessionId ? { agentSessionId: agent.agentSessionId } : {}),
          message: {
            length: parsed.data.message.length,
            source: parsed.data.source
          },
          context: {
            freshness: context.freshness
          },
          outputValidation,
          mate
        };
        lastResponses.set(roomId, response);
        return { ok: true, response };
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

    getLastResponse(roomId) {
      return lastResponses.get(roomId);
    }
  };
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
