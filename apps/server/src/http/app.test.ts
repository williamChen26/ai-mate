import { describe, expect, it } from "vitest";

import { loadServerConfig } from "../config.js";
import { createServerApp } from "./app.js";

describe("server app", () => {
  it("serves deterministic health and readiness responses", async () => {
    const { app } = await createServerApp({
      config: loadServerConfig({}),
      logger: false
    });

    const health = await app.inject({ method: "GET", url: "/health" });
    const ready = await app.inject({ method: "GET", url: "/ready" });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({
      ok: true,
      service: "@production-spec-graph/server",
      storage: "process-local-memory",
      syncRoute: "/sync/:roomId"
    });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      ok: true,
      ready: true,
      rooms: { roomCount: 0, roomIds: [] },
      storage: { durable: false }
    });

    await app.close();
  });

  it("registers a websocket route that creates same-room sessions", async () => {
    const { app, registry } = await createServerApp({
      config: loadServerConfig({}),
      logger: false
    });

    await app.ready();
    const first = await app.injectWS("/sync/alpha?sessionId=session:one");
    const second = await app.injectWS("/sync/alpha?sessionId=session:two");

    expect(first.readyState).toBe(first.OPEN);
    expect(second.readyState).toBe(second.OPEN);
    expect(registry.getStats()).toEqual({
      roomCount: 1,
      roomIds: ["alpha"]
    });

    first.close();
    second.close();
    await app.close();
  });

  it("rejects invalid room ids before creating rooms", async () => {
    const { app, registry } = await createServerApp({
      config: loadServerConfig({}),
      logger: false
    });

    await app.ready();
    const socket = await app.injectWS("/sync/bad%20room?sessionId=session:bad");

    expect(registry.getStats()).toEqual({ roomCount: 0, roomIds: [] });

    socket.close();
    await app.close();
  });
});
