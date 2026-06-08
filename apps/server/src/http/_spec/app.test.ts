import { describe, expect, it } from "vitest";
import { CANVAS_CONTEXT_SCHEMA_VERSION } from "@production-spec-graph/shared";

import { loadServerConfig } from "../../config.js";
import { createRoomMateService } from "../../mate/room-mate-service.js";
import { createServerApp } from "../app.js";

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
      agentLifecycle: { roomCount: 0, rooms: [] },
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

    const ready = await app.inject({ method: "GET", url: "/ready" });
    expect(ready.json()).toMatchObject({
      agentLifecycle: {
        roomCount: 1,
        rooms: [
          {
            roomId: "alpha",
            state: "unavailable",
            unavailableReason: "mate adapter is not configured"
          }
        ]
      }
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

  it("accepts room context snapshots and operation events through diagnostics endpoints", async () => {
    const { app } = await createServerApp({
      config: loadServerConfig({}),
      logger: false
    });

    const snapshot = {
      schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
      roomId: "alpha",
      source: {
        kind: "web",
        deviceId: "device:alpha",
        sessionId: "device:alpha:tab:one",
        tabId: "tab:one",
        capturedAt: "2026-06-03T00:00:00.000Z"
      },
      document: {
        shapeCount: 0,
        shapes: []
      },
      selection: {
        selectedShapeIds: []
      },
      viewport: {
        pageBounds: { x: 0, y: 0, w: 800, h: 600 },
        zoom: 1
      },
      freshness: {
        snapshotVersion: 1,
        eventVersionAtSnapshot: 0
      }
    };

    const snapshotResponse = await app.inject({
      method: "POST",
      url: "/rooms/alpha/context/snapshot",
      payload: snapshot
    });
    const eventResponse = await app.inject({
      method: "POST",
      url: "/rooms/alpha/context/events",
      payload: {
        schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
        roomId: "alpha",
        eventId: "event:1",
        eventVersion: 1,
        kind: "selection-change",
        source: snapshot.source,
        occurredAt: "2026-06-03T00:00:01.000Z",
        selectedShapeIds: []
      }
    });
    const contextResponse = await app.inject({
      method: "GET",
      url: "/rooms/alpha/context"
    });

    expect(snapshotResponse.statusCode).toBe(200);
    expect(eventResponse.statusCode).toBe(200);
    expect(contextResponse.json()).toMatchObject({
      ok: true,
      context: {
        roomId: "alpha",
        latestSnapshot: { roomId: "alpha" },
        recentEvents: [{ eventId: "event:1" }],
        freshness: {
          snapshotVersion: 1,
          eventVersion: 1,
          changedSinceSnapshot: true
        }
      }
    });

    await app.close();
  });

  it("allows configured web origins to publish room context", async () => {
    const { app } = await createServerApp({
      config: loadServerConfig({}),
      logger: false
    });

    const response = await app.inject({
      method: "OPTIONS",
      url: "/rooms/alpha/context/snapshot",
      headers: {
        origin: "http://127.0.0.1:3000",
        "access-control-request-method": "POST"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://127.0.0.1:3000"
    );
    expect(response.headers["access-control-allow-methods"]).toContain("POST");

    await app.close();
  });

  it("rejects cross-room context payloads without mutating diagnostics", async () => {
    const { app } = await createServerApp({
      config: loadServerConfig({}),
      logger: false
    });

    const response = await app.inject({
      method: "POST",
      url: "/rooms/beta/context/snapshot",
      payload: {
        schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
        roomId: "alpha",
        source: {
          kind: "web",
          deviceId: "device:alpha",
          sessionId: "device:alpha:tab:one",
          tabId: "tab:one",
          capturedAt: "2026-06-03T00:00:00.000Z"
        },
        document: { shapeCount: 0, shapes: [] },
        selection: { selectedShapeIds: [] },
        viewport: { pageBounds: { x: 0, y: 0, w: 800, h: 600 }, zoom: 1 },
        freshness: { snapshotVersion: 1, eventVersionAtSnapshot: 0 }
      }
    });
    const contextResponse = await app.inject({
      method: "GET",
      url: "/rooms/beta/context"
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      ok: false,
      error: { code: "ROOM_MISMATCH" }
    });
    expect(contextResponse.json()).toMatchObject({
      ok: true,
      context: {
        roomId: "beta",
        latestSnapshot: null,
        recentEvents: []
      }
    });

    await app.close();
  });

  it("returns explicit diagnostics for quiet rooms", async () => {
    const { app } = await createServerApp({
      config: loadServerConfig({}),
      logger: false
    });

    const response = await app.inject({
      method: "GET",
      url: "/rooms/quiet-room/diagnostics"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      diagnostics: {
        roomId: "quiet-room",
        room: {
          active: true,
          knownRoomIds: ["quiet-room"]
        },
        agentLifecycle: {
          roomId: "quiet-room",
          state: "unavailable",
          unavailableReason: "mate adapter is not configured"
        },
        context: {
          hasSnapshot: false,
          snapshotShapeCount: 0,
          recentEventCount: 0,
          freshness: {
            snapshotVersion: 0,
            eventVersion: 0,
            changedSinceSnapshot: false
          }
        },
        mate: {
          hasResponse: false,
          lastResponse: null
        },
        storage: {
          kind: "process-local-memory",
          durable: false
        }
      }
    });

    await app.close();
  });

  it("accepts room-scoped mate messages and returns raw mate turn data", async () => {
    const { app } = await createServerApp({
      config: loadServerConfig({}),
      logger: false
    });

    await app.inject({
      method: "POST",
      url: "/rooms/alpha/context/snapshot",
      payload: {
        schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
        roomId: "alpha",
        source: {
          kind: "web",
          deviceId: "device:alpha",
          sessionId: "device:alpha:tab:one",
          tabId: "tab:one",
          capturedAt: "2026-06-03T00:00:00.000Z"
        },
        document: {
          shapeCount: 1,
          shapes: [
            {
              id: "shape:one",
              type: "text",
              text: "Launch plan"
            }
          ]
        },
        selection: { selectedShapeIds: ["shape:one"] },
        viewport: { pageBounds: { x: 0, y: 0, w: 800, h: 600 }, zoom: 1 },
        freshness: { snapshotVersion: 1, eventVersionAtSnapshot: 0 }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/rooms/alpha/mate/messages",
      payload: {
        message: "Can you organize this?",
        source: {
          kind: "web",
          deviceId: "device:alpha",
          sessionId: "device:alpha:tab:one",
          tabId: "tab:one",
          sentAt: "2026-06-03T00:00:01.000Z"
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      response: {
        roomId: "alpha",
        message: { length: 22 },
        gateway: {
          trigger: {
            kind: "conversation",
            source: {
              deviceId: "device:alpha",
              sessionId: "device:alpha:tab:one"
            }
          },
          context: {
            snapshot: {
              state: "available",
              source: { origin: "server-context-feed" }
            },
            recentOperations: {
              state: "missing"
            },
            intentReadiness: {
              state: "incomplete",
              missing: expect.arrayContaining(["recent-operations"])
            }
          }
        },
        mate: {
          roomId: "alpha",
          output: { nonMutating: true },
          observations: {
            shapeCount: 1,
            textSnippets: ["Launch plan"]
          },
          interpretation: {
            intent: expect.stringMatching(/organize/i)
          }
        }
      }
    });

    const diagnostics = await app.inject({
      method: "GET",
      url: "/rooms/alpha/mate"
    });
    expect(diagnostics.json()).toMatchObject({
      ok: true,
      response: {
        roomId: "alpha",
        mate: { roomId: "alpha" }
      }
    });

    await app.close();
  });

  it("summarizes active room context, degraded lifecycle, and latest mate output in diagnostics", async () => {
    const { app } = await createServerApp({
      config: loadServerConfig({}),
      logger: false
    });

    await app.inject({
      method: "POST",
      url: "/rooms/alpha/context/snapshot",
      payload: {
        schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
        roomId: "alpha",
        source: {
          kind: "web",
          deviceId: "device:alpha",
          sessionId: "device:alpha:tab:one",
          tabId: "tab:one",
          capturedAt: "2026-06-03T00:00:00.000Z"
        },
        document: {
          shapeCount: 1,
          shapes: [
            {
              id: "shape:one",
              type: "text",
              text: "Launch plan"
            }
          ]
        },
        selection: { selectedShapeIds: ["shape:one"] },
        viewport: { pageBounds: { x: 0, y: 0, w: 800, h: 600 }, zoom: 1 },
        freshness: { snapshotVersion: 1, eventVersionAtSnapshot: 0 }
      }
    });
    await app.inject({
      method: "POST",
      url: "/rooms/alpha/context/events",
      payload: {
        schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
        roomId: "alpha",
        eventId: "event:1",
        eventVersion: 1,
        kind: "chat-boundary",
        source: {
          kind: "web",
          deviceId: "device:alpha",
          sessionId: "device:alpha:tab:one",
          tabId: "tab:one",
          capturedAt: "2026-06-03T00:00:01.000Z"
        },
        occurredAt: "2026-06-03T00:00:01.000Z",
        messageLength: 26
      }
    });
    await app.inject({
      method: "POST",
      url: "/rooms/alpha/mate/messages",
      payload: {
        message: "Add a note for follow up",
        source: {
          kind: "web",
          deviceId: "device:alpha",
          sessionId: "device:alpha:tab:one",
          tabId: "tab:one",
          sentAt: "2026-06-03T00:00:02.000Z"
        }
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/rooms/alpha/diagnostics"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      diagnostics: {
        roomId: "alpha",
        room: {
          active: true,
          knownRoomIds: ["alpha"]
        },
        agentLifecycle: {
          roomId: "alpha",
          state: "unavailable",
          unavailableReason: "mate adapter is not configured"
        },
        context: {
          hasSnapshot: true,
          snapshotShapeCount: 1,
          recentEventCount: 1,
          latestSnapshot: {
            source: {
              sessionId: "device:alpha:tab:one"
            }
          },
          freshness: {
            snapshotVersion: 1,
            eventVersion: 1,
            changedSinceSnapshot: true
          }
        },
        mate: {
          hasResponse: true,
          outputKind: "canvas-action-proposal",
          proposalStatus: "blocked",
          gatewaySummary: {
            triggerKind: "conversation",
            contextFreshness: {
              snapshotVersion: 1,
              eventVersion: 1,
              changedSinceSnapshot: true
            },
            intentReadiness: {
              state: expect.stringMatching(/ready|stale|incomplete/)
            },
            agentTurn: {
              finalOutputKind: expect.any(String)
            },
            runtime: {
              mode: "deterministic",
              outputSource: "deterministic-fallback",
              status: "used",
              fallbackUsed: true,
              toolCallCount: 0,
              toolCalls: []
            },
            outputKind: "canvas-action-proposal",
            outputValidation: {
              status: "blocked",
              applied: false
            },
            bounded: {
              storesFullPromptHistory: false,
              storesPromptText: false
            }
          },
          outputValidation: {
            ok: true,
            status: "blocked",
            applied: false
          },
          lastResponse: {
            roomId: "alpha",
            mate: {
              output: {
                kind: "canvas-action-proposal"
              }
            }
          }
        },
        storage: {
          kind: "process-local-memory",
          durable: false
        }
      }
    });
    expect(JSON.stringify(response.json().diagnostics.mate.gatewaySummary)).not.toContain(
      "Add a note for follow up"
    );
    expect(JSON.stringify(response.json().diagnostics.mate.lastResponse)).not.toContain(
      "Add a note for follow up"
    );

    await app.close();
  });

  it("routes AI Drop completion requests through the completion gateway", async () => {
    const { app } = await createServerApp({
      config: loadServerConfig({}),
      logger: false
    });

    await app.inject({
      method: "POST",
      url: "/rooms/alpha/context/snapshot",
      payload: {
        schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
        roomId: "alpha",
        source: {
          kind: "web",
          deviceId: "device:alpha",
          sessionId: "device:alpha:tab:one",
          tabId: "tab:one",
          capturedAt: "2026-06-08T00:00:00.000Z"
        },
        document: {
          shapeCount: 1,
          shapes: [
            {
              id: "shape:1",
              type: "text",
              text: "User story: As a",
              bounds: { x: 0, y: 0, w: 160, h: 48 }
            }
          ]
        },
        selection: { selectedShapeIds: ["shape:1"] },
        viewport: { pageBounds: { x: 0, y: 0, w: 800, h: 600 }, zoom: 1 },
        freshness: { snapshotVersion: 1, eventVersionAtSnapshot: 0 }
      }
    });
    await app.inject({
      method: "POST",
      url: "/rooms/alpha/context/events",
      payload: {
        schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
        roomId: "alpha",
        eventId: "event:1",
        eventVersion: 1,
        kind: "canvas-change",
        source: {
          kind: "web",
          deviceId: "device:alpha",
          sessionId: "device:alpha:tab:one",
          tabId: "tab:one",
          capturedAt: "2026-06-08T00:00:01.000Z"
        },
        occurredAt: "2026-06-08T00:00:02.000Z",
        affectedShapeIds: ["shape:1"],
        summary: "text edited in shape:1"
      }
    });
    await app.inject({
      method: "POST",
      url: "/rooms/alpha/context/snapshot",
      payload: {
        schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
        roomId: "alpha",
        source: {
          kind: "web",
          deviceId: "device:alpha",
          sessionId: "device:alpha:tab:one",
          tabId: "tab:one",
          capturedAt: "2026-06-08T00:00:02.500Z"
        },
        document: {
          shapeCount: 1,
          shapes: [
            {
              id: "shape:1",
              type: "text",
              text: "User story: As a",
              bounds: { x: 0, y: 0, w: 160, h: 48 }
            }
          ]
        },
        selection: { selectedShapeIds: ["shape:1"] },
        viewport: { pageBounds: { x: 0, y: 0, w: 800, h: 600 }, zoom: 1 },
        freshness: { snapshotVersion: 2, eventVersionAtSnapshot: 1 }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/rooms/alpha/mate/completions",
      payload: {
        selection: {
          state: "selected",
          selectedShapeIds: ["shape:1"]
        },
        viewport: {
          state: "available",
          pageBounds: { x: 0, y: 0, w: 800, h: 600 },
          zoom: 1
        },
        source: {
          kind: "web",
          deviceId: "device:alpha",
          sessionId: "device:alpha:tab:one",
          tabId: "tab:one",
          capturedAt: "2026-06-08T00:00:03.000Z"
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      response: {
        gateway: {
          trigger: { kind: "completion" }
        },
        mate: {
          output: {
            kind: "completion-proposal",
            proposal: {
              completion: {
                kind: "text-in-element",
                shapeId: "shape:1"
              }
            }
          },
          runtime: {
            path: "completion"
          }
        }
      }
    });

    await app.close();
  });

  it("keeps bounded diagnostics for malformed mate outputs", async () => {
    const { app } = await createServerApp({
      config: loadServerConfig({}),
      mateService: createRoomMateService({
        prepareTurnAsync: async () => ({
          roomId: "alpha",
          output: {
            kind: "canvas-action-proposal",
            proposal: {
              requiresAcceptance: false,
              action: { text: "Do not store this malformed text" }
            }
          }
        })
      }),
      logger: false
    });

    await app.inject({
      method: "POST",
      url: "/rooms/alpha/context/snapshot",
      payload: {
        schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
        roomId: "alpha",
        source: {
          kind: "web",
          deviceId: "device:alpha",
          sessionId: "device:alpha:tab:one",
          tabId: "tab:one",
          capturedAt: "2026-06-03T00:00:00.000Z"
        },
        document: { shapeCount: 0, shapes: [] },
        selection: { selectedShapeIds: [] },
        viewport: { pageBounds: { x: 0, y: 0, w: 800, h: 600 }, zoom: 1 },
        freshness: { snapshotVersion: 1, eventVersionAtSnapshot: 0 }
      }
    });

    const mateResponse = await app.inject({
      method: "POST",
      url: "/rooms/alpha/mate/messages",
      payload: {
        message: "Please create malformed diagnostics",
        source: {
          kind: "web",
          deviceId: "device:alpha",
          sessionId: "device:alpha:tab:one",
          tabId: "tab:one",
          sentAt: "2026-06-03T00:00:02.000Z"
        }
      }
    });
    const diagnosticsResponse = await app.inject({
      method: "GET",
      url: "/rooms/alpha/diagnostics"
    });

    expect(mateResponse.statusCode).toBe(400);
    expect(mateResponse.json()).toMatchObject({
      ok: false,
      error: { code: "INVALID_AGENT_OUTPUT" }
    });
    expect(diagnosticsResponse.json()).toMatchObject({
      ok: true,
      diagnostics: {
        mate: {
          hasDiagnostic: true,
          hasResponse: false,
          proposalStatus: "invalid",
          gatewaySummary: {
            triggerKind: "conversation",
            outputKind: "invalid",
            outputValidation: {
              status: "invalid",
              applied: false,
              reason: expect.any(String)
            },
            bounded: {
              storesPromptText: false,
              storesFullPromptHistory: false
            }
          },
          outputValidation: {
            ok: false,
            status: "invalid",
            applied: false,
            reason: expect.any(String)
          },
          failure: {
            code: "INVALID_AGENT_OUTPUT",
            bounded: {
              storesRawAgentOutput: false,
              storesPromptText: false,
              storesFullPromptHistory: false
            }
          }
        }
      }
    });
    expect(JSON.stringify(diagnosticsResponse.json().diagnostics.mate)).not.toContain(
      "Please create malformed diagnostics"
    );
    expect(JSON.stringify(diagnosticsResponse.json().diagnostics.mate)).not.toContain(
      "Do not store this malformed text"
    );

    await app.close();
  });

  it("rejects invalid mate message payloads", async () => {
    const { app } = await createServerApp({
      config: loadServerConfig({}),
      logger: false
    });

    const response = await app.inject({
      method: "POST",
      url: "/rooms/alpha/mate/messages",
      payload: {
        message: "",
        source: {
          kind: "web",
          deviceId: "device:alpha",
          sessionId: "device:alpha:tab:one",
          tabId: "tab:one",
          sentAt: "2026-06-03T00:00:01.000Z"
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      ok: false,
      error: { code: "INVALID_MATE_MESSAGE" }
    });

    await app.close();
  });
});
