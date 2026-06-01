import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";

import { type ServerConfig } from "../config.js";
import {
  createRoomRegistry,
  type RoomRegistry
} from "../sync/room-registry.js";
import { attachTldrawSyncSocket } from "../sync/tldraw-sync.js";

export type CreateServerAppOptions = {
  config: ServerConfig;
  registry?: RoomRegistry;
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
  logger = false
}: CreateServerAppOptions): Promise<ServerApp> {
  const app = Fastify({ logger });

  await app.register(websocket);

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
    storage: {
      kind: "process-local-memory",
      durable: false,
      note:
        "@tldraw/sync-core@5.0.1 uses explicit InMemorySyncStorage for each TLSocketRoom; restarting the process clears rooms."
    }
  }));

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
