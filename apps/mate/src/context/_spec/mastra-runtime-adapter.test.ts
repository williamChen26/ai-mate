import { describe, expect, it, vi } from "vitest";

import { AGENT_OUTPUT_SCHEMA_VERSION, createGatewayRequest } from "@production-spec-graph/shared";

import {
  createConfiguredMastraMateAgentRuntimeAdapter,
  createMastraMateAgentRuntimeAdapter,
  type MastraRuntimeAgentLike
} from "../mastra-runtime-adapter.js";
import { prepareMateTurnWithRuntime } from "../mate-turn.js";
import { makeRoomContextFeed } from "../test-fixtures.js";

describe("Mastra mate runtime adapter", () => {
  it("does not create a real adapter unless real mode is provider-ready", () => {
    expect(createConfiguredMastraMateAgentRuntimeAdapter({})).toBeUndefined();
    expect(
      createConfiguredMastraMateAgentRuntimeAdapter({
        MATE_AGENT_MODE: "real"
      })
    ).toBeUndefined();
    expect(
      createConfiguredMastraMateAgentRuntimeAdapter({
        MATE_AGENT_MODE: "real",
        DEEPSEEK_API_KEY: "deepseek-fixture"
      })?.config
    ).toMatchObject({
      mode: "real",
      provider: {
        provider: "deepseek",
        ready: true
      }
    });
  });

  it("routes conversation requests to the conversation agent final text path", async () => {
    const context = makeRoomContextFeed({
      roomId: "mastra-conversation",
      shapeTexts: ["Launch plan"],
      eventKinds: ["chat-boundary"]
    });
    const conversationAgent = makeAgent({
      text: "Real Mastra conversation answer",
      toolCalls: []
    });
    const completionAgent = makeAgent({ text: "should not run" });
    const runtime = createMastraMateAgentRuntimeAdapter({
      config: {
        mode: "real",
        provider: { provider: "deepseek", ready: true }
      },
      agents: {
        conversation: conversationAgent,
        completion: completionAgent
      }
    });

    const result = await prepareMateTurnWithRuntime(
      {
        roomId: "mastra-conversation",
        userMessage: "What is this board?",
        gateway: createConversationGateway(context),
        context
      },
      { agentRuntime: runtime }
    );

    expect(result.output).toMatchObject({
      kind: "conversation-answer",
      text: "Real Mastra conversation answer"
    });
    expect(result.runtime).toMatchObject({
      mode: "real",
      outputSource: "real-agent",
      toolCalls: []
    });
    expect(conversationAgent.generate).toHaveBeenCalledTimes(1);
    expect(completionAgent.generate).not.toHaveBeenCalled();
  });

  it("routes completion requests to structured completion output and tool diagnostics", async () => {
    const context = makeRoomContextFeed({
      roomId: "mastra-completion",
      shapeTexts: ["User story: As a"],
      eventKinds: ["canvas-change"],
      eventSummaries: ["text edited in shape:1"]
    });
    const completionOutput = {
      schemaVersion: AGENT_OUTPUT_SCHEMA_VERSION,
      outputId: "mastra-completion-output",
      roomId: "mastra-completion",
      createdAt: "2026-06-08T00:00:00.000Z",
      basedOn: {
        snapshotVersion: 1,
        eventVersion: 1,
        changedSinceSnapshot: false,
        stale: false
      },
      nonMutating: true,
      kind: "completion-proposal",
      proposal: {
        proposalId: "mastra-completion-proposal",
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
        rationale: "Mastra structured completion output."
      }
    };
    const completionAgent = makeAgent({
      object: completionOutput,
      text: JSON.stringify(completionOutput),
      toolCalls: [
        {
          toolName: "propose-completion",
          args: { previewOnly: true }
        }
      ],
      toolResults: [
        {
          toolName: "propose-completion",
          result: completionOutput
        }
      ]
    });
    const runtime = createMastraMateAgentRuntimeAdapter({
      config: {
        mode: "real",
        provider: { provider: "deepseek", ready: true }
      },
      agents: {
        conversation: makeAgent({ text: "should not run" }),
        completion: completionAgent
      }
    });

    const result = await prepareMateTurnWithRuntime(
      {
        roomId: "mastra-completion",
        gateway: createCompletionGateway(context),
        context
      },
      { agentRuntime: runtime }
    );

    expect(result.output.kind).toBe("completion-proposal");
    expect(result.runtime).toMatchObject({
      outputSource: "real-agent",
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
    expect(completionAgent.generate).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        structuredOutput: expect.any(Object),
        maxSteps: 3
      })
    );
  });

  it("returns a failed runtime result when Mastra generation throws", async () => {
    const context = makeRoomContextFeed({
      roomId: "mastra-error",
      shapeTexts: ["Launch plan"],
      eventKinds: ["chat-boundary"]
    });
    const runtime = createMastraMateAgentRuntimeAdapter({
      config: {
        mode: "real",
        provider: { provider: "deepseek", ready: true }
      },
      agents: {
        conversation: {
          generate: vi.fn(async () => {
            throw new Error("provider exploded with a long private stack");
          })
        },
        completion: makeAgent({ text: "unused" })
      }
    });

    const result = await prepareMateTurnWithRuntime(
      {
        roomId: "mastra-error",
        userMessage: "What is this?",
        gateway: createConversationGateway(context),
        context
      },
      { agentRuntime: runtime }
    );

    expect(result.runtime).toMatchObject({
      outputSource: "deterministic-fallback",
      status: "failed",
      fallbackUsed: true,
      reason: expect.stringContaining("provider exploded")
    });
  });
});

function makeAgent(output: {
  text?: string;
  object?: unknown;
  toolCalls?: unknown[];
  toolResults?: unknown[];
}): MastraRuntimeAgentLike {
  return {
    generate: vi.fn(async () => ({
      text: output.text ?? "",
      object: output.object,
      toolCalls: output.toolCalls ?? [],
      toolResults: output.toolResults ?? []
    }))
  };
}

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
