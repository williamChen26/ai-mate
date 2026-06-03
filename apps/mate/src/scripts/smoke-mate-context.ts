import { prepareMateTurn } from "../context/mate-turn.js";
import { makeRoomContextFeed } from "../context/test-fixtures.js";

const result = prepareMateTurn(
  {
    roomId: "smoke-room",
    userMessage: "Help me organize the launch plan",
    context: makeRoomContextFeed({
      roomId: "smoke-room",
      shapeTexts: ["Launch plan", "Risks", "Next decision"],
      eventKinds: ["canvas-change", "selection-change"],
      changedSinceSnapshot: true
    })
  },
  {
    now: () => "2026-06-03T00:00:10.000Z",
    turnId: () => "smoke-turn"
  }
);

if (!result.output.nonMutating) {
  throw new Error("Mate smoke produced a mutating output.");
}
if (!result.basedOn.stale) {
  throw new Error("Mate smoke did not preserve stale freshness metadata.");
}
if (!result.observations.textSnippets.includes("Launch plan")) {
  throw new Error("Mate smoke did not read canvas text from the context feed.");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      roomId: result.roomId,
      output: result.output,
      observations: result.observations,
      interpretation: result.interpretation,
      basedOn: result.basedOn,
      memory: result.memory
    },
    null,
    2
  )
);
