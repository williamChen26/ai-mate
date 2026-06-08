import { describe, expect, it } from "vitest";

import { createGatewayRequest } from "@production-spec-graph/shared";

import { prepareMateTurn } from "../mate-turn.js";
import { makeRoomContextFeed } from "../test-fixtures.js";

describe("prepareMateTurn", () => {
  it("rejects turn requests whose room id does not match the context feed", () => {
    expect(() =>
      prepareMateTurn({
        roomId: "room-a",
        userMessage: "What should I do next?",
        context: makeRoomContextFeed({ roomId: "room-b" })
      })
    ).toThrow(/context room id/i);
  });

  it("separates raw observations from inferred intent for a populated canvas", () => {
    const result = prepareMateTurn({
      roomId: "room-alpha",
      userMessage: "Can you help organize this?",
      context: makeRoomContextFeed({
        roomId: "room-alpha",
        shapeTexts: ["Launch plan", "Open risks"],
        eventKinds: ["selection-change", "canvas-change"]
      })
    });

    expect(result.observations.shapeCount).toBe(2);
    expect(result.observations.textSnippets).toEqual([
      "Launch plan",
      "Open risks"
    ]);
    expect(result.observations.recentEventKinds).toEqual([
      "selection-change",
      "canvas-change"
    ]);
    expect(result.interpretation.intent).toMatch(/organize/i);
    expect(result.interpretation.signals).toContain("user-message");
    expect(result.uncertainty).toEqual([]);
    expect(result.output.nonMutating).toBe(true);
  });

  it("marks the turn stale when events advanced after the snapshot", () => {
    const result = prepareMateTurn({
      roomId: "room-stale",
      userMessage: "Summarize the board",
      context: makeRoomContextFeed({
        roomId: "room-stale",
        shapeTexts: ["Initial snapshot"],
        eventKinds: ["canvas-change"],
        changedSinceSnapshot: true
      })
    });

    expect(result.basedOn).toMatchObject({
      snapshotVersion: 1,
      eventVersion: 2,
      changedSinceSnapshot: true,
      stale: true
    });
    expect(result.uncertainty.join(" ")).toMatch(/changed after the snapshot/i);
    expect(result.output.kind).toBe("question");
    if (result.output.kind !== "question") {
      throw new Error("Expected stale summary output to be a question.");
    }
    expect(result.output.text).toMatch(/refresh|confirm|changed/i);
  });

  it("handles an empty quiet room without fabricating intent", () => {
    const result = prepareMateTurn({
      roomId: "room-empty",
      context: makeRoomContextFeed({
        roomId: "room-empty",
        shapeTexts: [],
        eventKinds: []
      })
    });

    expect(result.observations.shapeCount).toBe(0);
    expect(result.interpretation.intent).toMatch(/unclear/i);
    expect(result.interpretation.confidence).toBe("low");
    expect(result.uncertainty.join(" ")).toMatch(/empty/i);
    expect(result.output.kind).toBe("question");
  });

  it("can prepare a passive non-mutating suggestion from recent activity without chat", () => {
    const result = prepareMateTurn({
      roomId: "room-active",
      mode: "passive",
      context: makeRoomContextFeed({
        roomId: "room-active",
        shapeTexts: ["Flow", "Decision"],
        eventKinds: ["canvas-change", "viewport-change"]
      })
    });

    expect(result.interpretation.signals).toContain("recent-canvas-change");
    expect(result.output.kind).toBe("suggestion");
    expect(result.output.nonMutating).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/mutation|proposal|apply/i);
  });

  it("emits a typed canvas action proposal when explicitly asked to add a note", () => {
    const result = prepareMateTurn({
      roomId: "room-proposal",
      userMessage: "Add a note for the next decision",
      context: makeRoomContextFeed({
        roomId: "room-proposal",
        shapeTexts: ["Launch plan", "Open risks"],
        eventKinds: []
      })
    });

    expect(result.output).toMatchObject({
      kind: "canvas-action-proposal",
      nonMutating: true,
      proposal: {
        status: "pending",
        requiresAcceptance: true,
        action: {
          kind: "create-text-note",
          mutatesCanvas: true
        }
      }
    });
  });

  it("blocks stale canvas action proposals", () => {
    const result = prepareMateTurn({
      roomId: "room-stale-proposal",
      userMessage: "Create a note for the next step",
      context: makeRoomContextFeed({
        roomId: "room-stale-proposal",
        shapeTexts: ["Initial snapshot"],
        eventKinds: ["canvas-change"],
        changedSinceSnapshot: true
      })
    });

    expect(result.output).toMatchObject({
      kind: "canvas-action-proposal",
      proposal: {
        status: "blocked",
        requiresAcceptance: true
      }
    });
    expect(JSON.stringify(result.output)).toMatch(/changed after the snapshot/i);
  });

  it("calls the text completion tool only when snapshot and operations show active text authoring", () => {
    const context = makeRoomContextFeed({
      roomId: "room-text-completion",
      shapeTexts: ["User story: As a"],
      eventKinds: ["canvas-change"],
      eventSummaries: ["text edited in shape:1"]
    });
    const result = prepareMateTurn({
      roomId: "room-text-completion",
      gateway: createCompletionGateway(context),
      context
    });

    expect(result.agentTurn.decision.intent).toBe("text-authoring");
    expect(result.agentTurn.decision.evidence.snapshot).toEqual(
      expect.arrayContaining(["selected-text-shape"])
    );
    expect(result.agentTurn.decision.evidence.recentOperations).toEqual(
      expect.arrayContaining(["text-edit-operation"])
    );
    expect(result.agentTurn.toolCalls).toMatchObject([
      {
        toolName: "completion",
        variant: "text-in-element",
        status: "called"
      }
    ]);
    expect(result.output).toMatchObject({
      kind: "completion-proposal",
      nonMutating: true,
      proposal: {
        previewOnly: true,
        requiresAcceptance: true,
        applied: false,
        completion: {
          kind: "text-in-element",
          shapeId: "shape:1"
        }
      }
    });
  });

  it("calls the flow continuation tool when snapshot and operations show diagram extension", () => {
    const context = makeRoomContextFeed({
      roomId: "room-flow-completion",
      shapeTexts: ["Start"],
      shapeTypes: ["geo"],
      eventKinds: ["canvas-change", "canvas-change"],
      eventSummaries: ["node created near shape:1", "connector created from shape:1"]
    });
    const result = prepareMateTurn({
      roomId: "room-flow-completion",
      gateway: createCompletionGateway(context),
      context
    });

    expect(result.agentTurn.decision.intent).toBe("flow-continuation");
    expect(result.agentTurn.toolCalls).toMatchObject([
      {
        toolName: "completion",
        variant: "flow-continuation",
        status: "called"
      }
    ]);
    expect(result.output).toMatchObject({
      kind: "completion-proposal",
      proposal: {
        previewOnly: true,
        applied: false,
        completion: {
          kind: "flow-continuation",
          anchorShapeId: "shape:1"
        }
      }
    });
  });

  it("declines completion when selection is misleading and operations show inspection", () => {
    const context = makeRoomContextFeed({
      roomId: "room-inspecting",
      shapeTexts: ["Decision"],
      eventKinds: ["selection-change", "viewport-change"]
    });
    const result = prepareMateTurn({
      roomId: "room-inspecting",
      gateway: createCompletionGateway(context),
      context
    });

    expect(result.agentTurn.decision.intent).toBe("inspect-or-navigate");
    expect(result.agentTurn.decision.evidence.snapshot).toContain("selected-shape");
    expect(result.agentTurn.decision.evidence.recentOperations).toEqual(
      expect.arrayContaining([
        "selection-or-viewport-only",
        "operation:0:event:1:selection-change",
        "operation:1:event:2:viewport-change"
      ])
    );
    expect(result.agentTurn.toolCalls).toEqual([]);
    expect(result.output).toMatchObject({
      kind: "no-op",
      nonMutating: true,
      reason: expect.stringMatching(/selection alone/i)
    });
  });

  it("uses the gateway bounded operation stack instead of older full context events", () => {
    const context = makeRoomContextFeed({
      roomId: "room-bounded-stack",
      shapeTexts: ["User story: As a"],
      eventKinds: ["canvas-change", "selection-change", "viewport-change"],
      eventSummaries: ["text edited in shape:1"]
    });
    const result = prepareMateTurn({
      roomId: "room-bounded-stack",
      gateway: createCompletionGateway(context, { operationLimit: 2 }),
      context
    });

    expect(result.agentTurn.decision.intent).toBe("inspect-or-navigate");
    expect(result.agentTurn.decision.evidence.recentOperations).not.toContain(
      "text-edit-operation"
    );
    expect(result.agentTurn.decision.evidence.recentOperations).toEqual(
      expect.arrayContaining([
        "operation:0:event:2:selection-change",
        "operation:1:event:3:viewport-change"
      ])
    );
    expect(result.agentTurn.toolCalls).toEqual([]);
    expect(result.output.kind).toBe("no-op");
  });

  it("asks for clarification when completion evidence lacks recent authoring operations", () => {
    const context = makeRoomContextFeed({
      roomId: "room-incomplete-completion",
      shapeTexts: ["User story: As a"],
      eventKinds: []
    });
    const result = prepareMateTurn({
      roomId: "room-incomplete-completion",
      gateway: createCompletionGateway(context),
      context
    });

    expect(result.agentTurn.finalOutputKind).toBe("clarifying-question");
    expect(result.agentTurn.decision.intent).toBe("needs-clarification");
    expect(result.agentTurn.decision.evidence.snapshot).toContain(
      "selected-text-shape"
    );
    expect(result.agentTurn.decision.evidence.recentOperations).toEqual([]);
    expect(result.agentTurn.decision.reason).toMatch(/recent authoring|snapshot evidence/i);
    expect(result.agentTurn.toolCalls).toEqual([]);
    expect(result.output).toMatchObject({
      kind: "question",
      nonMutating: true
    });
  });

  it("answers conversation turns without completion tool calls", () => {
    const context = makeRoomContextFeed({
      roomId: "room-conversation",
      shapeTexts: ["Launch plan"],
      eventKinds: ["canvas-change", "chat-boundary"]
    });
    const result = prepareMateTurn({
      roomId: "room-conversation",
      userMessage: "What should I do next?",
      gateway: createGatewayRequest({
        requestId: "gateway:conversation",
        roomId: "room-conversation",
        createdAt: "2026-06-03T00:00:05.000Z",
        trigger: {
          kind: "conversation",
          message: "What should I do next?",
          chatBoundary: { state: "missing", reason: "fixture uses server event" },
          source: {
            kind: "web",
            deviceId: "device-fixture",
            sessionId: "session-fixture",
            tabId: "tab-fixture",
            sentAt: "2026-06-03T00:00:05.000Z"
          }
        },
        context
      }),
      context
    });

    expect(result.agentTurn.decision.intent).toBe("conversation-answer");
    expect(result.agentTurn.toolCalls).toEqual([]);
    expect(result.output).toMatchObject({
      kind: "conversation-answer",
      nonMutating: true
    });
  });
});

function createCompletionGateway(
  context: ReturnType<typeof makeRoomContextFeed>,
  options: { operationLimit?: number } = {}
) {
  return createGatewayRequest({
    requestId: `gateway:${context.roomId}:completion`,
    roomId: context.roomId,
    createdAt: "2026-06-03T00:00:05.000Z",
    ...(options.operationLimit ? { operationLimit: options.operationLimit } : {}),
    trigger: {
      kind: "completion",
      invokedBy: "ai-drop",
      selection: {
        state: "selected",
        selectedShapeIds: ["shape:1"],
        source: {
          origin: "front-end-runtime-signal",
          source: context.latestSnapshot?.source
        }
      },
      viewport: {
        state: "available",
        pageBounds: { x: 0, y: 0, w: 1200, h: 800 },
        zoom: 1,
        source: {
          origin: "front-end-runtime-signal",
          source: context.latestSnapshot?.source
        }
      },
      source: context.latestSnapshot?.source ?? {
        kind: "web",
        deviceId: "device-fixture",
        sessionId: "session-fixture",
        tabId: "tab-fixture",
        capturedAt: "2026-06-03T00:00:00.000Z"
      }
    },
    context
  });
}
