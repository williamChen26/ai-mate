import { describe, expect, it } from "vitest";

import { createGatewayRequest, type AgentOutput } from "@production-spec-graph/shared";

import {
  createMateAgentRuntimeConfig,
  selectMateAgentPath,
  type MateAgentRuntimeAdapter
} from "../agent-runtime.js";
import {
  prepareMateTurn,
  prepareMateTurnWithRuntime
} from "../mate-turn.js";
import { makeRoomContextFeed } from "../test-fixtures.js";

describe("mate agent runtime boundary", () => {
  it("keeps deterministic fallback as the default credential-free runtime", () => {
    const result = prepareMateTurn({
      roomId: "runtime-default",
      userMessage: "Summarize this",
      context: makeRoomContextFeed({
        roomId: "runtime-default",
        shapeTexts: ["Launch plan"],
        eventKinds: []
      })
    });

    expect(result.runtime).toMatchObject({
      mode: "deterministic",
      outputSource: "deterministic-fallback",
      status: "used",
      fallbackUsed: true
    });
  });

  it("reports DeepSeek readiness without requiring credentials by default", () => {
    expect(createMateAgentRuntimeConfig({})).toMatchObject({
      mode: "deterministic",
      provider: {
        provider: "deepseek",
        ready: false
      }
    });
    expect(
      createMateAgentRuntimeConfig({
        MATE_AGENT_MODE: "real"
      })
    ).toMatchObject({
      mode: "real",
      provider: {
        provider: "deepseek",
        ready: false,
        reason: expect.stringMatching(/DEEPSEEK_API_KEY/i)
      }
    });
    expect(
      createMateAgentRuntimeConfig({
        MATE_AGENT_MODE: "real",
        DEEPSEEK_API_KEY: "deepseek-fixture"
      })
    ).toMatchObject({
      mode: "real",
      provider: {
        provider: "deepseek",
        ready: true
      }
    });
  });

  it("selects product agent path from gateway trigger instead of asking the model to route", () => {
    const context = makeRoomContextFeed({
      roomId: "runtime-routing",
      shapeTexts: ["Launch plan"],
      eventKinds: ["chat-boundary"]
    });
    const conversation = createGatewayRequest({
      requestId: "gateway:runtime-routing",
      roomId: "runtime-routing",
      createdAt: "2026-06-08T00:00:00.000Z",
      trigger: {
        kind: "conversation",
        message: "What is this board about?",
        chatBoundary: {
          state: "missing",
          reason: "fixture uses gateway trigger only"
        },
        source: {
          kind: "web",
          deviceId: "device-fixture",
          sessionId: "session-fixture",
          tabId: "tab-fixture",
          sentAt: "2026-06-08T00:00:00.000Z"
        }
      },
      context
    });

    expect(selectMateAgentPath(conversation)).toEqual({
      path: "conversation",
      agentId: "mate-conversation-agent"
    });
    expect(selectMateAgentPath()).toEqual({
      path: "legacy",
      agentId: "deterministic-mate"
    });
  });

  it("can consume fake real-agent output without network calls", async () => {
    const context = makeRoomContextFeed({
      roomId: "runtime-fake",
      shapeTexts: ["Launch plan"],
      eventKinds: []
    });
    const fakeRuntime: MateAgentRuntimeAdapter = {
      config: {
        mode: "fake",
        provider: {
          provider: "deepseek",
          ready: false,
          reason: "fake runtime does not call a provider"
        }
      },
      async run(request) {
        expect(request.promptPack).toMatchObject({
          path: "legacy",
          roomId: "runtime-fake",
          context: {
            snapshot: {
              shapeCount: 1
            }
          }
        });
        return {
          ok: true,
          output: {
            schemaVersion: "agent-output.v1",
            kind: "conversation-answer",
            outputId: "fake-output",
            roomId: request.roomId,
            createdAt: "2026-06-08T00:00:00.000Z",
            basedOn: request.fallback.basedOn,
            nonMutating: true,
            text: "Fake canvas agent answer"
          }
        };
      }
    };

    const result = await prepareMateTurnWithRuntime(
      {
        roomId: "runtime-fake",
        userMessage: "Summarize this",
        context
      },
      { agentRuntime: fakeRuntime }
    );

    expect(result.output).toMatchObject({
      kind: "conversation-answer",
      text: "Fake canvas agent answer"
    });
    expect(result.runtime).toMatchObject({
      mode: "fake",
      outputSource: "fake-agent",
      status: "used",
      fallbackUsed: false
    });
  });

  it("normalizes fake conversation plain text without requiring an answer tool", async () => {
    const context = makeRoomContextFeed({
      roomId: "runtime-text",
      shapeTexts: ["Launch plan"],
      eventKinds: []
    });
    const fakeRuntime: MateAgentRuntimeAdapter = {
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
          output: "Plain fake model answer"
        };
      }
    };

    const result = await prepareMateTurnWithRuntime(
      {
        roomId: "runtime-text",
        userMessage: "What is this?",
        gateway: createConversationGateway(context),
        context
      },
      { agentRuntime: fakeRuntime }
    );

    expect(result.output).toMatchObject({
      kind: "conversation-answer",
      text: "Plain fake model answer"
    });
    expect(result.agentTurn.toolCalls).toEqual([]);
    expect(result.runtime.outputSource).toBe("fake-agent");
    expect(result.runtime.toolCalls).toEqual([]);
  });

  it("records bounded runtime tool-call metadata for completion proposals", async () => {
    const context = makeRoomContextFeed({
      roomId: "runtime-tools",
      shapeTexts: ["User story: As a"],
      eventKinds: ["canvas-change"],
      eventSummaries: ["text edited in shape:1"]
    });
    const fakeRuntime: MateAgentRuntimeAdapter = {
      config: {
        mode: "fake",
        provider: {
          provider: "deepseek",
          ready: false
        }
      },
      async run(request) {
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
            outputId: "runtime-tool-output",
            roomId: request.roomId,
            createdAt: "2026-06-08T00:00:00.000Z",
            basedOn: request.fallback.basedOn,
            nonMutating: true,
            proposal: {
              proposalId: "runtime-tool-proposal",
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
              rationale: "The completion tool returned preview-only data."
            }
          }
        };
      }
    };

    const result = await prepareMateTurnWithRuntime(
      {
        roomId: "runtime-tools",
        gateway: createCompletionGateway(context),
        context
      },
      { agentRuntime: fakeRuntime }
    );

    expect(result.output.kind).toBe("completion-proposal");
    expect(result.runtime).toMatchObject({
      mode: "fake",
      toolCallCount: 1,
      toolCalls: [
        {
          toolName: "propose-completion",
          status: "called",
          outputKind: "completion-proposal",
          previewOnly: true
        }
      ]
    });
  });

  it("falls back when fake runtime returns invalid agent output", async () => {
    const context = makeRoomContextFeed({
      roomId: "runtime-invalid",
      shapeTexts: ["Launch plan"],
      eventKinds: []
    });
    const fakeRuntime: MateAgentRuntimeAdapter = {
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
          toolCalls: [
            {
              toolName: "propose-completion",
              status: "failed",
              outputKind: "completion-proposal",
              previewOnly: true,
              reason: "model returned malformed output"
            }
          ],
          output: {
            kind: "conversation-answer",
            text: ""
          } as unknown as AgentOutput
        };
      }
    };

    const result = await prepareMateTurnWithRuntime(
      {
        roomId: "runtime-invalid",
        userMessage: "Summarize this",
        context
      },
      { agentRuntime: fakeRuntime }
    );

    expect(result.output).not.toMatchObject({
      outputId: "fake-output"
    });
    expect(result.runtime).toMatchObject({
      mode: "fake",
      outputSource: "deterministic-fallback",
      status: "failed",
      fallbackUsed: true
    });
    expect(result.runtime.toolCalls).toMatchObject([
      {
        toolName: "propose-completion",
        status: "failed",
        reason: "model returned malformed output"
      }
    ]);
  });

  it("falls back when conversation runtime returns a completion proposal", async () => {
    const context = makeRoomContextFeed({
      roomId: "runtime-wrong-path",
      shapeTexts: ["Launch plan"],
      eventKinds: []
    });
    const fakeRuntime: MateAgentRuntimeAdapter = {
      config: {
        mode: "fake",
        provider: {
          provider: "deepseek",
          ready: false
        }
      },
      async run(request) {
        return {
          ok: true,
          output: {
            schemaVersion: "agent-output.v1",
            kind: "completion-proposal",
            outputId: "wrong-output",
            roomId: request.roomId,
            createdAt: "2026-06-08T00:00:00.000Z",
            basedOn: request.fallback.basedOn,
            nonMutating: true,
            proposal: {
              proposalId: "wrong-proposal",
              status: "pending",
              previewOnly: true,
              requiresAcceptance: true,
              applied: false,
              completion: {
                kind: "text-in-element",
                shapeId: "shape:1",
                currentText: "Launch plan",
                proposedText: "Launch plan next"
              },
              rationale: "Wrong path"
            }
          }
        };
      }
    };

    const result = await prepareMateTurnWithRuntime(
      {
        roomId: "runtime-wrong-path",
        userMessage: "What is this?",
        gateway: createConversationGateway(context),
        context
      },
      { agentRuntime: fakeRuntime }
    );

    expect(result.output.kind).toBe("conversation-answer");
    expect(result.runtime).toMatchObject({
      outputSource: "deterministic-fallback",
      status: "failed",
      reason: "completion-proposal-not-supported-for-conversation"
    });
  });
});

function createConversationGateway(context: ReturnType<typeof makeRoomContextFeed>) {
  return createGatewayRequest({
    requestId: `gateway:${context.roomId}:conversation`,
    roomId: context.roomId,
    createdAt: "2026-06-08T00:00:00.000Z",
    trigger: {
      kind: "conversation",
      message: "What is this?",
      chatBoundary: { state: "missing", reason: "fixture" },
      source: {
        kind: "web",
        deviceId: "device-fixture",
        sessionId: "session-fixture",
        tabId: "tab-fixture",
        sentAt: "2026-06-08T00:00:00.000Z"
      }
    },
    context
  });
}

function createCompletionGateway(context: ReturnType<typeof makeRoomContextFeed>) {
  return createGatewayRequest({
    requestId: `gateway:${context.roomId}:completion`,
    roomId: context.roomId,
    createdAt: "2026-06-08T00:00:00.000Z",
    trigger: {
      kind: "completion",
      invokedBy: "ai-drop",
      selection: {
        state: "selected",
        selectedShapeIds: ["shape:1"]
      },
      viewport: {
        state: "available",
        pageBounds: { x: 0, y: 0, w: 1200, h: 800 },
        zoom: 1
      },
      source: {
        kind: "web",
        deviceId: "device-fixture",
        sessionId: "session-fixture",
        tabId: "tab-fixture",
        capturedAt: "2026-06-08T00:00:00.000Z"
      }
    },
    context
  });
}
