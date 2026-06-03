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

export type RoomMateService = {
  handleMessage: (input: {
    roomId: string;
    payload: unknown;
    context: RoomContextFeed;
    agent?: { agentSessionId?: string };
  }) => RoomMateResult;
  getLastResponse: (roomId: string) => RoomMateResponse | undefined;
};

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
