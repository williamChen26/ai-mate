import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";

import { isOriginAllowed, type ServerConfig } from "../config.js";
import {
  createRoomContextStore,
  type RoomContextStore
} from "../context/room-context-store.js";
import { createRoomDiagnostics } from "../diagnostics/room-diagnostics.js";
import {
  createRoomMateService,
  type RoomMateService
} from "../mate/room-mate-service.js";
import {
  createRoomRegistry,
  type RoomRegistry
} from "../sync/room-registry.js";
import { attachTldrawSyncSocket } from "../sync/tldraw-sync.js";

/**
 * 构造 Fastify server 的依赖集合。测试可以注入 registry/context/mate 实现，
 * 生产启动使用默认实现。
 */
export type CreateServerAppOptions = {
  config: ServerConfig;
  registry?: RoomRegistry;
  contextStore?: RoomContextStore;
  mateService?: RoomMateService;
  logger?: boolean;
};

/**
 * Fastify app 以及 runtime smoke tests 使用的 room registry。
 */
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

/**
 * 构建拥有 room sync、context ingestion、mate messages 和 raw diagnostics 的
 * Fastify app。
 */
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

  app.options("/rooms/:roomId/diagnostics", async (_request, reply) =>
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
      context: contextStore.getFeed(
        room.roomId,
        getAgentContext(registry, room.roomId)
      )
    };
  });

  app.post<{
    Params: SyncRouteParams;
  }>("/rooms/:roomId/context/snapshot", async (request, reply) => {
    const room = ensureRoomForContext(request.params.roomId, registry);
    if (!room.ok) {
      return reply.code(400).send(room);
    }

    // snapshot 是 web 从 tldraw editor 主动推送来的 AI 输入摘要；server 只校验并
    // 存成这个 room 的 latestSnapshot，不从 sync storage 反向拉取完整 tldraw 文档。
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

  app.get<{
    Params: SyncRouteParams;
  }>("/rooms/:roomId/diagnostics", async (request, reply) => {
    const room = ensureRoomForContext(request.params.roomId, registry);
    if (!room.ok) {
      return reply.code(400).send(room);
    }

    const latestMateResponse = mateService.getLastResponse(room.roomId);

    return {
      ok: true,
      diagnostics: createRoomDiagnostics({
        roomId: room.roomId,
        stats: registry.getStats(),
        agentLifecycle: registry.getAgentLifecycleDiagnostics(),
        context: contextStore.getFeed(
          room.roomId,
          getAgentContext(registry, room.roomId)
        ),
        ...(latestMateResponse ? { latestMateResponse } : {}),
        generatedAt: new Date().toISOString()
      })
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
    // mate 每次响应读取的是 context store 当前 feed：最新 snapshot + 有界 recent
    // events + freshness，而不是直接访问前端 editor 或 tldraw sync room。
    const result = mateService.handleMessage({
      roomId: room.roomId,
      payload: request.body,
      context: contextStore.getFeed(
        room.roomId,
        getAgentContext(registry, room.roomId)
      ),
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

/**
 * 查询 room 的 mate session id，并整理成 context/mate 调用所需形态。
 */
function getAgentContext(registry: RoomRegistry, roomId: string) {
  const agentSessionId = registry.getAgentSessionId(roomId);
  return agentSessionId ? { agentSessionId } : undefined;
}

/**
 * 为需要 room 级状态的 HTTP endpoints 校验或创建 room。非法 id 会变成结构化
 * 400 响应，而不是未捕获异常。
 */
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
