import { WebSocket } from "ws";

import { DEFAULT_SYNC_ROUTE, loadServerConfig } from "../src/config.js";
import { createServerApp } from "../src/http/app.js";

const config = {
  ...loadServerConfig({
    HOST: "127.0.0.1",
    PORT: "3101",
    SYNC_ROUTE: DEFAULT_SYNC_ROUTE,
    ALLOWED_ORIGINS: "http://127.0.0.1:3100"
  }),
  port: 0
};

const { app, registry } = await createServerApp({
  config,
  logger: false
});

const address = await app.listen({
  host: config.host,
  port: config.port
});
const base = new URL(address);

try {
  await assertHttpOk(new URL("/health", base));
  await assertHttpOk(new URL("/ready", base));

  const first = await openSocket(
    new URL(`${config.syncRoute}/alpha?sessionId=session:smoke-one`, base)
  );
  const second = await openSocket(
    new URL(`${config.syncRoute}/alpha?sessionId=session:smoke-two`, base)
  );

  if (registry.getStats().roomCount !== 1) {
    throw new Error("Expected both smoke sockets to share one room.");
  }

  const readyWithRoom = await readJson(new URL("/ready", base));
  assertAgentLifecycleReady(readyWithRoom);

  const invalid = await openSocket(
    new URL(`${config.syncRoute}/bad%20room?sessionId=session:bad`, base)
  );
  await closeSocket(invalid);

  first.close();
  second.close();

  console.log(
    JSON.stringify(
      {
        ok: true,
        health: "/health",
        ready: "/ready",
        syncRoute: `${config.syncRoute}/:roomId?sessionId=:sessionId`,
        roomStats: registry.getStats(),
        agentLifecycle: registry.getAgentLifecycleDiagnostics(),
        storage: "process-local-memory"
      },
      null,
      2
    )
  );
} finally {
  await app.close();
}

async function assertHttpOk(url: URL): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url.pathname} returned ${response.status}`);
  }
}

async function readJson(url: URL): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url.pathname} returned ${response.status}`);
  }
  return response.json();
}

function assertAgentLifecycleReady(value: unknown): void {
  if (!isRecord(value)) {
    throw new Error("Expected /ready to return an object.");
  }
  const agentLifecycle = value.agentLifecycle;
  if (!isRecord(agentLifecycle)) {
    throw new Error("Expected /ready to include agentLifecycle diagnostics.");
  }
  if (agentLifecycle.roomCount !== 1) {
    throw new Error("Expected agentLifecycle diagnostics for one room.");
  }
  if (!Array.isArray(agentLifecycle.rooms)) {
    throw new Error("Expected agentLifecycle.rooms to be an array.");
  }
  const alpha = agentLifecycle.rooms.find(
    (room) => isRecord(room) && room.roomId === "alpha"
  );
  if (!isRecord(alpha)) {
    throw new Error("Expected agentLifecycle diagnostics for room alpha.");
  }
  if (alpha.state !== "unavailable") {
    throw new Error(
      `Expected default mate lifecycle to be unavailable, received ${String(alpha.state)}.`
    );
  }
  if (typeof alpha.agentSessionId !== "string") {
    throw new Error("Expected room alpha to include an agent session id.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function openSocket(url: URL): Promise<WebSocket> {
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out connecting to ${url}`));
    }, 5_000);

    socket.once("open", () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function closeSocket(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (
      socket.readyState === WebSocket.CLOSED ||
      socket.readyState === WebSocket.CLOSING
    ) {
      resolve();
      return;
    }
    socket.once("close", () => resolve());
    socket.close();
  });
}
