import { describe, expect, it } from "vitest";

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
});
