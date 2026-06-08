import { describe, expect, it } from "vitest";
import {
  CANVAS_CONTEXT_SCHEMA_VERSION,
  roomContextFeedSchema,
  type RoomContextFeed
} from "@production-spec-graph/shared";

import { createRoomMateService } from "../room-mate-service.js";

const source = {
  kind: "web",
  deviceId: "device:alpha",
  sessionId: "device:alpha:tab:one",
  tabId: "tab:one",
  sentAt: "2026-06-03T00:00:04.000Z"
};

describe("room mate service", () => {
  it("combines a room message with context and returns a mate turn", () => {
    const service = createRoomMateService({
      now: () => "2026-06-03T00:00:05.000Z",
      turnId: () => "turn:alpha"
    });
    const result = service.handleMessage({
      roomId: "alpha",
      payload: {
        message: "Help organize this board",
        source
      },
      context: makeRoomContextFeed({
        roomId: "alpha",
        shapeTexts: ["Launch plan", "Risks"],
        eventKinds: ["canvas-change"],
        changedSinceSnapshot: false
      }),
      agent: { agentSessionId: "mate:alpha:session" }
    });

    expect(result).toMatchObject({
      ok: true,
      response: {
        roomId: "alpha",
        agentSessionId: "mate:alpha:session",
        message: { length: 24 },
        mate: {
          roomId: "alpha",
          agentTurn: {
            decision: { intent: "conversation-answer" },
            toolCalls: []
          },
          output: {
            kind: "conversation-answer",
            nonMutating: true
          },
          observations: {
            shapeCount: 2,
            textSnippets: ["Launch plan", "Risks"]
          },
          interpretation: {
            intent: expect.stringMatching(/organize/i)
          }
        }
      }
    });
    expect(service.getLastResponse("alpha")?.mate.turnId).toBe("turn:alpha");
  });

  it("maps raw room messages to conversation gateway requests without changing mate output", () => {
    const service = createRoomMateService({
      now: () => "2026-06-03T00:00:05.000Z",
      turnId: () => "turn:gateway"
    });
    const result = service.handleMessage({
      roomId: "alpha",
      payload: {
        message: "Help organize this board",
        source
      },
      context: makeRoomContextFeed({
        roomId: "alpha",
        shapeTexts: ["Launch plan"],
        eventKinds: ["canvas-change", "chat-boundary"]
      })
    });

    expect(result).toMatchObject({
      ok: true,
      response: {
        gateway: {
          roomId: "alpha",
          trigger: {
            kind: "conversation",
            chatBoundary: {
              state: "available",
              source: { origin: "server-context-feed" }
            }
          },
          context: {
            snapshot: {
              state: "available",
              source: { origin: "server-context-feed" }
            },
            recentOperations: {
              state: "available",
              source: { origin: "server-context-feed" },
              operations: [
                { eventId: "event:1", kind: "canvas-change" },
                { eventId: "event:2", kind: "chat-boundary" }
              ]
            }
          }
        },
        mate: {
          roomId: "alpha",
          agentTurn: {
            decision: { intent: "conversation-answer" },
            toolCalls: []
          },
          output: { nonMutating: true }
        }
      }
    });
  });

  it("rejects empty messages before calling mate", () => {
    const service = createRoomMateService();
    const result = service.handleMessage({
      roomId: "alpha",
      payload: {
        message: "   ",
        source
      },
      context: makeRoomContextFeed({ roomId: "alpha" })
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_MATE_MESSAGE" }
    });
    expect(service.getLastResponse("alpha")).toBeUndefined();
  });

  it("rejects context feeds for another room", () => {
    const service = createRoomMateService();
    const result = service.handleMessage({
      roomId: "alpha",
      payload: {
        message: "What changed?",
        source
      },
      context: makeRoomContextFeed({ roomId: "beta" })
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "ROOM_MISMATCH" }
    });
  });

  it("reports invalid gateway requests separately from mate turn failures", () => {
    const service = createRoomMateService({
      prepareTurn: () => {
        throw new Error("prepareTurn should not be called");
      }
    });
    const context = {
      ...makeRoomContextFeed({ roomId: "alpha" }),
      generatedAt: "not-a-date"
    } as RoomContextFeed;
    const result = service.handleMessage({
      roomId: "alpha",
      payload: {
        message: "What changed?",
        source
      },
      context
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_GATEWAY_REQUEST" }
    });
  });

  it("returns typed proposal diagnostics without applying canvas actions", () => {
    const service = createRoomMateService({
      now: () => "2026-06-03T00:00:05.000Z",
      turnId: () => "turn:proposal"
    });
    const result = service.handleMessage({
      roomId: "alpha",
      payload: {
        message: "Add a note for the next decision",
        source
      },
      context: makeRoomContextFeed({
        roomId: "alpha",
        shapeTexts: ["Launch plan"],
        eventKinds: []
      })
    });

    expect(result).toMatchObject({
      ok: true,
      response: {
        outputValidation: {
          ok: true,
          status: "pending",
          applied: false
        },
        mate: {
          output: {
            kind: "canvas-action-proposal",
            proposal: {
              requiresAcceptance: true,
              action: { kind: "create-text-note" }
            }
          }
        }
      }
    });
  });

  it("marks stale proposals as blocked using context freshness", () => {
    const service = createRoomMateService();
    const result = service.handleMessage({
      roomId: "alpha",
      payload: {
        message: "Create a note for this",
        source
      },
      context: makeRoomContextFeed({
        roomId: "alpha",
        shapeTexts: ["Old view"],
        eventKinds: ["canvas-change"],
        changedSinceSnapshot: true
      })
    });

    expect(result).toMatchObject({
      ok: true,
      response: {
        outputValidation: {
          ok: true,
          status: "blocked",
          applied: false,
          reason: expect.stringMatching(/changed after the snapshot/i)
        }
      }
    });
  });

  it("rejects malformed mate outputs with inspectable diagnostics", () => {
    const service = createRoomMateService({
      prepareTurn: () => ({
        roomId: "alpha",
        output: {
          kind: "canvas-action-proposal",
          proposal: {
            requiresAcceptance: false
          }
        }
      })
    });
    const result = service.handleMessage({
      roomId: "alpha",
      payload: {
        message: "Add a note",
        source
      },
      context: makeRoomContextFeed({ roomId: "alpha" })
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_AGENT_OUTPUT" }
    });
    expect(service.getLastResponse("alpha")).toBeUndefined();
    expect(service.getLastDiagnosticRecord("alpha")).toMatchObject({
      diagnosticKind: "failure",
      roomId: "alpha",
      outputValidation: {
        ok: false,
        status: "invalid",
        applied: false,
        reason: expect.any(String)
      },
      error: {
        code: "INVALID_AGENT_OUTPUT"
      },
      bounded: {
        storesRawAgentOutput: false,
        storesPromptText: false,
        storesFullPromptHistory: false
      }
    });
  });

  it("handles conversation through async fake runtime and records runtime metadata", async () => {
    const service = createRoomMateService({
      now: () => "2026-06-08T00:00:05.000Z",
      turnId: () => "turn:async-fake",
      agentRuntime: {
        config: {
          mode: "fake",
          provider: {
            provider: "deepseek",
            ready: false
          }
        },
        async run(request) {
          expect(request.promptPack.path).toBe("conversation");
          return {
            ok: true,
            output: "Async fake answer from the conversation agent."
          };
        }
      }
    });

    const result = await service.handleMessageAsync({
      roomId: "alpha",
      payload: {
        message: "What is this board?",
        source
      },
      context: makeRoomContextFeed({
        roomId: "alpha",
        shapeTexts: ["Launch plan"],
        eventKinds: ["chat-boundary"],
        changedSinceSnapshot: false
      })
    });

    expect(result).toMatchObject({
      ok: true,
      response: {
        mate: {
          output: {
            kind: "conversation-answer",
            text: "Async fake answer from the conversation agent."
          },
          runtime: {
            mode: "fake",
            outputSource: "fake-agent",
            status: "used",
            fallbackUsed: false
          }
        }
      }
    });
  });

  it("creates stream-ready conversation events from async final response", async () => {
    const service = createRoomMateService({
      now: () => "2026-06-08T00:00:05.000Z",
      turnId: () => "turn:stream",
      agentRuntime: {
        config: {
          mode: "fake",
          provider: {
            provider: "deepseek",
            ready: false
          }
        },
        async run() {
          return {
            ok: true,
            output: "Streamed fake answer"
          };
        }
      }
    });

    const result = await service.streamMessage({
      roomId: "alpha",
      payload: {
        message: "Stream this",
        source
      },
      context: makeRoomContextFeed({
        roomId: "alpha",
        shapeTexts: ["Launch plan"],
        eventKinds: ["chat-boundary"],
        changedSinceSnapshot: false
      })
    });

    expect(result).toMatchObject({
      ok: true,
      events: [
        {
          kind: "started",
          roomId: "alpha",
          triggerKind: "conversation",
          runtime: {
            outputSource: "fake-agent"
          }
        },
        {
          kind: "delta",
          roomId: "alpha",
          text: "Streamed fake answer"
        },
        {
          kind: "final",
          roomId: "alpha",
          response: {
            mate: {
              output: {
                kind: "conversation-answer"
              }
            }
          }
        }
      ]
    });
  });

  it("falls back safely when real runtime mode lacks DeepSeek credentials", async () => {
    const service = createRoomMateService({
      now: () => "2026-06-08T00:00:05.000Z",
      turnId: () => "turn:real-fallback",
      runtimeConfig: {
        mode: "real",
        provider: {
          provider: "deepseek",
          ready: false,
          reason: "DEEPSEEK_API_KEY is required for real mate agent mode."
        }
      }
    });

    const result = await service.handleMessageAsync({
      roomId: "alpha",
      payload: {
        message: "What is this board?",
        source
      },
      context: makeRoomContextFeed({
        roomId: "alpha",
        shapeTexts: ["Launch plan"],
        eventKinds: ["chat-boundary"],
        changedSinceSnapshot: false
      })
    });

    expect(result).toMatchObject({
      ok: true,
      response: {
        mate: {
          runtime: {
            mode: "real",
            outputSource: "deterministic-fallback",
            status: "skipped",
            fallbackUsed: true,
            provider: {
              provider: "deepseek",
              ready: false
            }
          }
        }
      }
    });
  });

  it("handles deterministic AI Drop text completion from completion gateway context", async () => {
    const service = createRoomMateService({
      now: () => "2026-06-08T00:00:05.000Z",
      turnId: () => "turn:completion"
    });
    const result = await service.handleCompletionAsync({
      roomId: "alpha",
      payload: makeCompletionPayload(),
      context: makeRoomContextFeed({
        roomId: "alpha",
        shapeTexts: ["User story: As a"],
        eventKinds: ["canvas-change"],
        eventSummaries: ["text edited in shape:1"],
        changedSinceSnapshot: false
      })
    });

    expect(result).toMatchObject({
      ok: true,
      response: {
        gateway: {
          trigger: {
            kind: "completion"
          }
        },
        mate: {
          output: {
            kind: "completion-proposal",
            proposal: {
              previewOnly: true,
              requiresAcceptance: true,
              completion: {
                kind: "text-in-element",
                shapeId: "shape:1"
              }
            }
          },
          runtime: {
            path: "completion",
            outputSource: "deterministic-fallback"
          }
        }
      }
    });
  });

  it("handles fake runtime structured completion proposals", async () => {
    const service = createRoomMateService({
      now: () => "2026-06-08T00:00:05.000Z",
      turnId: () => "turn:fake-completion",
      agentRuntime: {
        config: {
          mode: "fake",
          provider: { provider: "deepseek", ready: false }
        },
        async run(request) {
          expect(request.promptPack.path).toBe("completion");
          return {
            ok: true,
            toolCalls: [
              {
                toolName: "propose-completion",
                status: "called",
                outputKind: "completion-proposal",
                previewOnly: true
              }
            ],
            output: {
              schemaVersion: "agent-output.v1",
              kind: "completion-proposal",
              outputId: "fake-completion-output",
              roomId: request.roomId,
              createdAt: "2026-06-08T00:00:05.000Z",
              basedOn: request.fallback.basedOn,
              nonMutating: true,
              proposal: {
                proposalId: "fake-completion-proposal",
                status: "pending",
                previewOnly: true,
                requiresAcceptance: true,
                applied: false,
                completion: {
                  kind: "text-in-element",
                  shapeId: "shape:1",
                  currentText: "User story: As a",
                  proposedText: "User story: As a buyer, I want a receipt"
                },
                rationale: "Fake runtime returned structured AI Drop output."
              }
            }
          };
        }
      }
    });

    const result = await service.handleCompletionAsync({
      roomId: "alpha",
      payload: makeCompletionPayload(),
      context: makeRoomContextFeed({
        roomId: "alpha",
        shapeTexts: ["User story: As a"],
        eventKinds: ["canvas-change"],
        eventSummaries: ["text edited in shape:1"],
        changedSinceSnapshot: false
      })
    });

    expect(result).toMatchObject({
      ok: true,
      response: {
        mate: {
          output: {
            kind: "completion-proposal",
            outputId: "fake-completion-output"
          },
          runtime: {
            mode: "fake",
            path: "completion",
            outputSource: "fake-agent",
            fallbackUsed: false,
            toolCallCount: 1,
            toolCalls: [
              {
                toolName: "propose-completion",
                status: "called",
                outputKind: "completion-proposal",
                previewOnly: true
              }
            ]
          }
        }
      }
    });
  });

  it("falls back safely when completion runtime returns plain text", async () => {
    const service = createRoomMateService({
      now: () => "2026-06-08T00:00:05.000Z",
      turnId: () => "turn:bad-completion",
      agentRuntime: {
        config: {
          mode: "fake",
          provider: { provider: "deepseek", ready: false }
        },
        async run() {
          return {
            ok: true,
            output: "Plain text cannot become AI Drop preview."
          };
        }
      }
    });

    const result = await service.handleCompletionAsync({
      roomId: "alpha",
      payload: makeCompletionPayload(),
      context: makeRoomContextFeed({
        roomId: "alpha",
        shapeTexts: ["User story: As a"],
        eventKinds: [],
        changedSinceSnapshot: false
      })
    });

    expect(result).toMatchObject({
      ok: true,
      response: {
        mate: {
          output: {
            kind: "question"
          },
          runtime: {
            outputSource: "deterministic-fallback",
            status: "failed",
            reason: "plain-text-not-supported-for-completion"
          }
        }
      }
    });
  });
});

function makeRoomContextFeed({
  roomId,
  shapeTexts = ["Launch plan"],
  eventKinds = ["canvas-change"],
  eventSummaries,
  changedSinceSnapshot
}: {
  roomId: string;
  shapeTexts?: string[];
  eventKinds?: Array<"canvas-change" | "selection-change" | "chat-boundary">;
  eventSummaries?: string[];
  changedSinceSnapshot?: boolean;
}): RoomContextFeed {
  const eventVersion = changedSinceSnapshot ? eventKinds.length + 1 : eventKinds.length;
  return roomContextFeedSchema.parse({
    roomId,
    agentSessionId: `mate:${roomId}:session`,
    latestSnapshot: {
      schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
      roomId,
      source: {
        kind: "web",
        deviceId: "device:alpha",
        sessionId: "device:alpha:tab:one",
        tabId: "tab:one",
        capturedAt: "2026-06-03T00:00:00.000Z"
      },
      document: {
        shapeCount: shapeTexts.length,
        shapes: shapeTexts.map((text, index) => ({
          id: `shape:${index + 1}`,
          type: "text",
          text
        }))
      },
      selection: { selectedShapeIds: shapeTexts.length > 0 ? ["shape:1"] : [] },
      viewport: { pageBounds: { x: 0, y: 0, w: 800, h: 600 }, zoom: 1 },
      freshness: { snapshotVersion: 1, eventVersionAtSnapshot: 0 }
    },
    recentEvents: eventKinds.map((kind, index) => ({
      schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
      roomId,
      eventId: `event:${index + 1}`,
      eventVersion: index + 1,
      kind,
      source: {
        kind: "web",
        deviceId: "device:alpha",
        sessionId: "device:alpha:tab:one",
        tabId: "tab:one",
        capturedAt: "2026-06-03T00:00:01.000Z"
      },
      occurredAt: "2026-06-03T00:00:02.000Z",
      ...(kind === "canvas-change"
        ? { affectedShapeIds: ["shape:1"], summary: eventSummaries?.[index] ?? "fixture change" }
        : kind === "selection-change"
          ? { selectedShapeIds: ["shape:1"] }
          : { messageLength: 24 })
    })),
    freshness: {
      snapshotVersion: 1,
      eventVersion,
      changedSinceSnapshot: changedSinceSnapshot ?? eventKinds.length > 0
    },
    generatedAt: "2026-06-03T00:00:03.000Z"
  });
}

function makeCompletionPayload() {
  return {
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
      capturedAt: "2026-06-08T00:00:04.000Z"
    }
  };
}
