import { describe, expect, it } from "vitest";

import {
  AGENT_OUTPUT_SCHEMA_VERSION,
  AI_GATEWAY_SCHEMA_VERSION
} from "@production-spec-graph/shared";

import {
  createConversationGatewayState,
  classifyConversationGatewayResponse,
  getConversationOutputText,
  type ConversationGatewayState
} from "../conversation-gateway.js";

describe("conversation gateway response classification", () => {
  it("starts idle, blocks empty messages, and exposes pending state", () => {
    expect(createConversationGatewayState("idle")).toMatchObject({
      status: "idle"
    });
    expect(createConversationGatewayState("pending")).toMatchObject({
      status: "pending"
    });
    expect(createConversationGatewayState("empty-message")).toMatchObject({
      status: "error",
      error: "Message is required."
    });
  });

  it("renders conversation-answer outputs with gateway and freshness metadata", () => {
    const state = classifyConversationGatewayResponse(
      createRawMateResponse({
        output: createAgentOutput("conversation-answer", {
          text: "Based on the board, group the launch risks."
        })
      })
    );

    expect(state).toMatchObject({
      status: "success",
      outputKind: "conversation-answer",
      triggerKind: "conversation",
      freshnessState: "fresh",
      readinessState: "ready",
      text: "Based on the board, group the launch risks."
    });
    expect(state.raw).toBeTruthy();
  });

  it("renders question, suggestion, and no-op outputs as direct conversation results", () => {
    const question = classifyConversationGatewayResponse(
      createRawMateResponse({
        output: createAgentOutput("question", { text: "What should I inspect?" })
      })
    );
    const suggestion = classifyConversationGatewayResponse(
      createRawMateResponse({
        output: createAgentOutput("suggestion", { text: "Group related notes." })
      })
    );
    const noOp = classifyConversationGatewayResponse(
      createRawMateResponse({
        output: createAgentOutput("no-op", { reason: "Selection is navigation only." })
      })
    );

    expect(getConversationOutputText(question)).toBe("What should I inspect?");
    expect(getConversationOutputText(suggestion)).toBe("Group related notes.");
    expect(getConversationOutputText(noOp)).toBe("Selection is navigation only.");
  });

  it("marks stale and incomplete context from gateway metadata", () => {
    const stale = classifyConversationGatewayResponse(
      createRawMateResponse({
        freshness: { changedSinceSnapshot: true, stale: true },
        intentReadiness: {
          state: "stale",
          stale: true,
          missing: ["recent-operations"]
        }
      })
    );
    const incomplete = classifyConversationGatewayResponse(
      createRawMateResponse({
        intentReadiness: {
          state: "incomplete",
          stale: false,
          missing: ["chat-boundary"]
        }
      })
    );

    expect(stale).toMatchObject({
      status: "context-stale",
      freshnessState: "stale",
      readinessState: "stale",
      missingContext: ["recent-operations"]
    });
    expect(incomplete).toMatchObject({
      status: "context-incomplete",
      freshnessState: "fresh",
      readinessState: "incomplete",
      missingContext: ["chat-boundary"]
    });
  });

  it("quarantines completion proposals instead of activating AI Drop", () => {
    const state = classifyConversationGatewayResponse(
      createRawMateResponse({
        output: createCompletionProposalOutput()
      })
    );

    expect(state).toMatchObject({
      status: "unsupported-output",
      outputKind: "completion-proposal",
      error: "Completion proposals are only accepted by AI Drop."
    });
  });

  it("turns malformed, server, and network failures into inspectable error states", () => {
    expect(classifyConversationGatewayResponse(null)).toMatchObject({
      status: "error",
      error: "Malformed mate response."
    });
    expect(
      classifyConversationGatewayResponse({
        ok: false,
        error: { code: "MATE_TURN_FAILED", message: "boom" }
      })
    ).toMatchObject({
      status: "error",
      error: "boom"
    });
    expect(createConversationGatewayState("error", "network down")).toMatchObject({
      status: "error",
      error: "network down"
    });
  });
});

function createRawMateResponse(input: {
  output?: unknown;
  freshness?: { changedSinceSnapshot: boolean; stale: boolean };
  intentReadiness?: {
    state: "ready" | "stale" | "incomplete";
    stale: boolean;
    missing: string[];
  };
} = {}) {
  const freshness = {
    snapshotVersion: 1,
    eventVersion: 1,
    changedSinceSnapshot: input.freshness?.changedSinceSnapshot ?? false,
    stale: input.freshness?.stale ?? false
  };

  return {
    ok: true,
    response: {
      roomId: "alpha",
      context: { freshness },
      gateway: {
        schemaVersion: AI_GATEWAY_SCHEMA_VERSION,
        requestId: "gateway:one",
        roomId: "alpha",
        createdAt: "2026-06-07T00:00:00.000Z",
        trigger: { kind: "conversation" },
        context: {
          freshness,
          intentReadiness: input.intentReadiness ?? {
            state: "ready",
            stale: false,
            missing: []
          }
        }
      },
      mate: {
        roomId: "alpha",
        agentTurn: {
          finalOutputKind: "conversation-answer"
        },
        output:
          input.output ??
          createAgentOutput("conversation-answer", {
            text: "Based on the board, group related notes."
          })
      },
      outputValidation: {
        status: "safe",
        outputKind: "conversation-answer"
      }
    }
  };
}

function createAgentOutput(
  kind: "conversation-answer" | "question" | "suggestion" | "no-op",
  data: { text?: string; reason?: string }
) {
  return {
    schemaVersion: AGENT_OUTPUT_SCHEMA_VERSION,
    outputId: `output:${kind}`,
    roomId: "alpha",
    createdAt: "2026-06-07T00:00:01.000Z",
    basedOn: {
      snapshotVersion: 1,
      eventVersion: 1,
      changedSinceSnapshot: false,
      stale: false
    },
    nonMutating: true,
    kind,
    ...(kind === "no-op"
      ? { reason: data.reason ?? "No action." }
      : { text: data.text ?? "Answer." })
  };
}

function createCompletionProposalOutput() {
  return {
    schemaVersion: AGENT_OUTPUT_SCHEMA_VERSION,
    outputId: "output:completion",
    roomId: "alpha",
    createdAt: "2026-06-07T00:00:01.000Z",
    basedOn: {
      snapshotVersion: 1,
      eventVersion: 1,
      changedSinceSnapshot: false,
      stale: false
    },
    nonMutating: true,
    kind: "completion-proposal",
    proposal: {
      proposalId: "proposal:completion",
      status: "pending",
      previewOnly: true,
      requiresAcceptance: true,
      applied: false,
      completion: {
        kind: "text-in-element",
        shapeId: "shape:text",
        currentText: "Hello",
        proposedText: "Hello there"
      },
      rationale: "Fixture should not activate AI Drop from conversation."
    }
  };
}
