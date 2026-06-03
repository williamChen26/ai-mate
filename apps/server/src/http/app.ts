import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";

import { isOriginAllowed, type ServerConfig } from "../config.js";
import {
  createRoomContextStore,
  type RoomContextStore
} from "../context/room-context-store.js";
import {
  createRoomMateService,
  type RoomMateService
} from "../mate/room-mate-service.js";
import {
  createRoomRegistry,
  type RoomRegistry
} from "../sync/room-registry.js";
import { attachTldrawSyncSocket } from "../sync/tldraw-sync.js";

export type CreateServerAppOptions = {
  config: ServerConfig;
  registry?: RoomRegistry;
  contextStore?: RoomContextStore;
  mateService?: RoomMateService;
  logger?: boolean;
};

export type ServerApp = {
  app: FastifyInstance;
  registry: RoomRegistry;
};

type SyncRouteParams = {
  roomId: string;
};

type SyncRouteQuery = {
  sessionId?: string;
};

export async function createServerApp({
  config,
  registry = createRoomRegistry(),
  contextStore = createRoomContextStore(),
  mateService = createRoomMateService(),
  logger = false
}: CreateServerAppOptions): Promise<ServerApp> {
  const app = Fastify({ logger });

  await app.register(websocket);

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (isOriginAllowed(origin, config.allowedOrigins) && origin) {
      reply.header("access-control-allow-origin", origin);
      reply.header("access-control-allow-methods", "GET,POST,OPTIONS");
      reply.header("access-control-allow-headers", "content-type");
    }
  });

  app.get("/health", async () => ({
    ok: true,
    service: "@production-spec-graph/server",
    mode: "development",
    storage: "process-local-memory",
    processLocal: true,
    syncRoute: `${config.syncRoute}/:roomId`
  }));

  app.get("/ready", async () => ({
    ok: true,
    ready: true,
    rooms: registry.getStats(),
    agentLifecycle: registry.getAgentLifecycleDiagnostics(),
    storage: {
      kind: "process-local-memory",
      durable: false,
      note:
        "@tldraw/sync-core@5.0.1 uses explicit InMemorySyncStorage for each TLSocketRoom; restarting the process clears rooms."
    }
  }));

  app.options("/rooms/:roomId/context/snapshot", async (_request, reply) =>
    reply.code(204).send()
  );

  app.options("/rooms/:roomId/context/events", async (_request, reply) =>
    reply.code(204).send()
  );

  app.options("/rooms/:roomId/mate/messages", async (_request, reply) =>
    reply.code(204).send()
  );

  app.get<{
    Params: SyncRouteParams;
  }>("/rooms/:roomId/context", async (request, reply) => {
    const room = ensureRoomForContext(request.params.roomId, registry);
    if (!room.ok) {
      return reply.code(400).send(room);
    }

    return {
      ok: true,
      context: contextStore.getFeed(room.roomId, getAgentContext(registry, room.roomId))
    };
  });

  app.post<{
    Params: SyncRouteParams;
  }>("/rooms/:roomId/context/snapshot", async (request, reply) => {
    const room = ensureRoomForContext(request.params.roomId, registry);
    if (!room.ok) {
      return reply.code(400).send(room);
    }

    const result = contextStore.acceptSnapshot(
      room.roomId,
      request.body,
      getAgentContext(registry, room.roomId)
    );
    return reply.code(result.ok ? 200 : 400).send(result);
  });

  app.post<{
    Params: SyncRouteParams;
  }>("/rooms/:roomId/context/events", async (request, reply) => {
    const room = ensureRoomForContext(request.params.roomId, registry);
    if (!room.ok) {
      return reply.code(400).send(room);
    }

    const result = contextStore.appendEvent(
      room.roomId,
      request.body,
      getAgentContext(registry, room.roomId)
    );
    return reply.code(result.ok ? 200 : 400).send(result);
  });

  app.get<{
    Params: SyncRouteParams;
  }>("/rooms/:roomId/mate", async (request, reply) => {
    const room = ensureRoomForContext(request.params.roomId, registry);
    if (!room.ok) {
      return reply.code(400).send(room);
    }

    return {
      ok: true,
      response: mateService.getLastResponse(room.roomId) ?? null
    };
  });

  app.post<{
    Params: SyncRouteParams;
  }>("/rooms/:roomId/mate/messages", async (request, reply) => {
    const room = ensureRoomForContext(request.params.roomId, registry);
    if (!room.ok) {
      return reply.code(400).send(room);
    }

    const agent = getAgentContext(registry, room.roomId);
    const result = mateService.handleMessage({
      roomId: room.roomId,
      payload: request.body,
      context: contextStore.getFeed(room.roomId, getAgentContext(registry, room.roomId)),
      ...(agent ? { agent } : {})
    });
    return reply.code(result.ok ? 200 : 400).send(result);
  });

  app.get<{
    Params: SyncRouteParams;
    Querystring: SyncRouteQuery;
  }>(
    `${config.syncRoute}/:roomId`,
    { websocket: true },
    (socket, request) => {
      attachTldrawSyncSocket(
        socket,
        {
          roomId: request.params.roomId,
          sessionId: request.query.sessionId,
          origin: request.headers.origin
        },
        registry,
        config
      );
    }
  );

  app.addHook("onClose", async () => {
    registry.closeAll();
  });

  return { app, registry };
}

function getAgentContext(registry: RoomRegistry, roomId: string) {
  const agentSessionId = registry.getAgentSessionId(roomId);
  return agentSessionId ? { agentSessionId } : undefined;
}

function ensureRoomForContext(
  roomId: string,
  registry: RoomRegistry
): { ok: true; roomId: string } | { ok: false; error: { code: string; message: string } } {
  try {
    registry.getOrCreateRoom(roomId);
    return { ok: true, roomId };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "INVALID_ROOM_ID",
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}
