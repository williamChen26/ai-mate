import {
  canvasSnapshotSchema,
  createEmptyRoomContextFeed,
  roomContextFeedSchema,
  roomOperationEventSchema,
  type CanvasSnapshot,
  type RoomContextFeed,
  type RoomOperationEvent
} from "@production-spec-graph/shared";

export type RoomContextErrorCode =
  | "INVALID_CONTEXT"
  | "INVALID_EVENT"
  | "ROOM_MISMATCH";

export type RoomContextError = {
  code: RoomContextErrorCode;
  message: string;
};

export type RoomContextResult =
  | { ok: true; context: RoomContextFeed }
  | { ok: false; error: RoomContextError };

export type RoomContextStoreOptions = {
  eventLimit?: number;
  now?: () => string;
};

export type AgentContext = {
  agentSessionId?: string;
};

type MutableRoomContext = {
  latestSnapshot: CanvasSnapshot | null;
  recentEvents: RoomOperationEvent[];
  eventVersion: number;
};

export type RoomContextStore = {
  acceptSnapshot: (
    routeRoomId: string,
    payload: unknown,
    agent?: AgentContext
  ) => RoomContextResult;
  appendEvent: (
    routeRoomId: string,
    payload: unknown,
    agent?: AgentContext
  ) => RoomContextResult;
  getFeed: (roomId: string, agent?: AgentContext) => RoomContextFeed;
};

export function createRoomContextStore({
  eventLimit = 50,
  now = () => new Date().toISOString()
}: RoomContextStoreOptions = {}): RoomContextStore {
  const contexts = new Map<string, MutableRoomContext>();

  function getMutable(roomId: string): MutableRoomContext {
    const existing = contexts.get(roomId);
    if (existing) {
      return existing;
    }
    const created: MutableRoomContext = {
      latestSnapshot: null,
      recentEvents: [],
      eventVersion: 0
    };
    contexts.set(roomId, created);
    return created;
  }

  return {
    acceptSnapshot(routeRoomId, payload, agent) {
      const parsed = canvasSnapshotSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: "INVALID_CONTEXT",
            message: parsed.error.issues.map((issue) => issue.message).join("; ")
          }
        };
      }
      if (parsed.data.roomId !== routeRoomId) {
        return roomMismatch(routeRoomId, parsed.data.roomId);
      }

      const context = getMutable(routeRoomId);
      context.latestSnapshot = parsed.data;
      return { ok: true, context: buildFeed(routeRoomId, context, agent, now()) };
    },

    appendEvent(routeRoomId, payload, agent) {
      const parsed = roomOperationEventSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: "INVALID_EVENT",
            message: parsed.error.issues.map((issue) => issue.message).join("; ")
          }
        };
      }
      if (parsed.data.roomId !== routeRoomId) {
        return roomMismatch(routeRoomId, parsed.data.roomId);
      }

      const context = getMutable(routeRoomId);
      context.eventVersion = Math.max(context.eventVersion, parsed.data.eventVersion);
      context.recentEvents = [...context.recentEvents, parsed.data].slice(
        -eventLimit
      );
      return { ok: true, context: buildFeed(routeRoomId, context, agent, now()) };
    },

    getFeed(roomId, agent) {
      const context = contexts.get(roomId);
      if (!context) {
        return createEmptyRoomContextFeed({
          roomId,
          ...(agent?.agentSessionId
            ? { agentSessionId: agent.agentSessionId }
            : {}),
          generatedAt: now()
        });
      }

      return buildFeed(roomId, context, agent, now());
    }
  };
}

function buildFeed(
  roomId: string,
  context: MutableRoomContext,
  agent: AgentContext | undefined,
  generatedAt: string
): RoomContextFeed {
  const snapshotVersion = context.latestSnapshot?.freshness.snapshotVersion ?? 0;
  const eventVersion = context.eventVersion;
  const eventVersionAtSnapshot =
    context.latestSnapshot?.freshness.eventVersionAtSnapshot ?? 0;

  return roomContextFeedSchema.parse({
    roomId,
    ...(agent?.agentSessionId ? { agentSessionId: agent.agentSessionId } : {}),
    latestSnapshot: context.latestSnapshot,
    recentEvents: context.recentEvents,
    freshness: {
      snapshotVersion,
      eventVersion,
      changedSinceSnapshot: eventVersion > eventVersionAtSnapshot
    },
    generatedAt
  });
}

function roomMismatch(routeRoomId: string, payloadRoomId: string): RoomContextResult {
  return {
    ok: false,
    error: {
      code: "ROOM_MISMATCH",
      message: `Payload room id ${payloadRoomId} does not match route room id ${routeRoomId}.`
    }
  };
}
