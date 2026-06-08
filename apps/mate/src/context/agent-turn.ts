import {
  AGENT_OUTPUT_SCHEMA_VERSION,
  agentOutputSchema,
  type AgentOutputFreshness,
  type GatewayRequest,
  type RoomContextFeed,
  type RoomOperationEvent
} from "@production-spec-graph/shared";
import { z } from "zod";

export const agentTurnPlanSchema = z.object({
  observation: z.object({
    triggerKind: z.enum(["completion", "conversation", "legacy"]),
    snapshotFacts: z.array(z.string()),
    recentOperationFacts: z.array(z.string())
  }),
  decision: z.object({
    intent: z.string(),
    confidence: z.enum(["low", "medium", "high"]),
    evidence: z.object({
      snapshot: z.array(z.string()),
      recentOperations: z.array(z.string())
    }),
    reason: z.string()
  }),
  toolCalls: z.array(
    z.object({
      toolName: z.literal("completion"),
      variant: z.enum(["text-in-element", "flow-continuation"]),
      status: z.literal("called"),
      previewOnly: z.literal(true)
    })
  ),
  finalOutputKind: z.enum([
    "completion-proposal",
    "conversation-answer",
    "clarifying-question",
    "no-op-refusal",
    "legacy-output"
  ])
});

export type AgentTurnPlan = z.infer<typeof agentTurnPlanSchema>;

/**
 * 生成 gateway-aware agent turn 决策摘要。这里把“看到的快照事实”和“最近操作栈事实”
 * 分开记录，避免后续补全逻辑只凭 selection 或最新快照误判用户正在创作。
 */
export function planAgentTurn(input: {
  gateway?: GatewayRequest;
  context: RoomContextFeed;
  uncertainty: string[];
  basedOn: AgentOutputFreshness;
}): AgentTurnPlan {
  const snapshotFacts = collectSnapshotFacts(input.gateway, input.context);
  const recentOperations = getDecisionOperations(input.gateway, input.context);
  const recentOperationFacts = collectRecentOperationFacts(recentOperations);
  const triggerKind = input.gateway?.trigger.kind ?? "legacy";

  if (input.gateway?.trigger.kind === "completion") {
    const textEvidence =
      snapshotFacts.includes("selected-text-shape") &&
      recentOperationFacts.includes("text-edit-operation");
    if (textEvidence && !input.basedOn.stale) {
      return {
        observation: { triggerKind, snapshotFacts, recentOperationFacts },
        decision: {
          intent: "text-authoring",
          confidence: "high",
          evidence: {
            snapshot: ["selected-text-shape"],
            recentOperations: recentOperationFacts.filter((fact) =>
              fact.includes("text-edit-operation") || fact.startsWith("operation:")
            )
          },
          reason: "Selected text shape and recent text-edit operation both indicate active text authoring."
        },
        toolCalls: [
          {
            toolName: "completion",
            variant: "text-in-element",
            status: "called",
            previewOnly: true
          }
        ],
        finalOutputKind: "completion-proposal"
      };
    }

    const flowEvidence =
      snapshotFacts.includes("selected-diagram-shape") &&
      recentOperationFacts.includes("flow-authoring-operation");
    if (flowEvidence && !input.basedOn.stale) {
      return {
        observation: { triggerKind, snapshotFacts, recentOperationFacts },
        decision: {
          intent: "flow-continuation",
          confidence: "medium",
          evidence: {
            snapshot: ["selected-diagram-shape"],
            recentOperations: recentOperationFacts.filter((fact) =>
              fact.includes("flow-authoring-operation") || fact.startsWith("operation:")
            )
          },
          reason: "Selected diagram-like shape and recent flow authoring operations indicate process continuation."
        },
        toolCalls: [
          {
            toolName: "completion",
            variant: "flow-continuation",
            status: "called",
            previewOnly: true
          }
        ],
        finalOutputKind: "completion-proposal"
      };
    }

    if (
      snapshotFacts.includes("selected-shape") &&
      recentOperationFacts.includes("selection-or-viewport-only")
    ) {
      return {
        observation: { triggerKind, snapshotFacts, recentOperationFacts },
        decision: {
          intent: "inspect-or-navigate",
          confidence: "medium",
          evidence: {
            snapshot: ["selected-shape"],
            recentOperations: recentOperationFacts.filter((fact) =>
              fact === "selection-or-viewport-only" || fact.startsWith("operation:")
            )
          },
          reason: "Selection alone is not enough; recent operations look like navigation or inspection."
        },
        toolCalls: [],
        finalOutputKind: "no-op-refusal"
      };
    }

    return {
      observation: { triggerKind, snapshotFacts, recentOperationFacts },
      decision: {
        intent: "needs-clarification",
        confidence: "low",
        evidence: {
          snapshot: snapshotFacts,
          recentOperations: recentOperationFacts
        },
        reason:
          missingAuthoringEvidenceReason(snapshotFacts, recentOperationFacts) ??
          input.uncertainty[0] ??
          "Completion intent needs both snapshot evidence and recent authoring operations."
      },
      toolCalls: [],
      finalOutputKind: "clarifying-question"
    };
  }

  if (input.gateway?.trigger.kind === "conversation") {
    return {
      observation: { triggerKind, snapshotFacts, recentOperationFacts },
      decision: {
        intent: "conversation-answer",
        confidence: input.uncertainty.length > 0 ? "medium" : "high",
        evidence: {
          snapshot: snapshotFacts,
          recentOperations: recentOperationFacts
        },
        reason: "Conversation gateway requests answer the user message without using completion tools."
      },
      toolCalls: [],
      finalOutputKind: "conversation-answer"
    };
  }

  return {
    observation: { triggerKind, snapshotFacts, recentOperationFacts },
    decision: {
      intent: "legacy-mate-turn",
      confidence: input.uncertainty.length > 0 ? "low" : "medium",
      evidence: {
        snapshot: snapshotFacts,
        recentOperations: recentOperationFacts
      },
      reason: "No gateway request was provided, so the turn uses the legacy deterministic mate path."
    },
    toolCalls: [],
    finalOutputKind: "legacy-output"
  };
}

function missingAuthoringEvidenceReason(
  snapshotFacts: string[],
  recentOperationFacts: string[]
) {
  if (!snapshotFacts.includes("latest-snapshot")) {
    return "Completion needs latest snapshot evidence before suggesting a candidate.";
  }
  if (!recentOperationFacts.includes("recent-operations")) {
    return "Completion needs recent authoring operations before suggesting a candidate.";
  }
  return undefined;
}

/**
 * 调用本 sprint 的“补全 tool”确定性替身。它只返回 preview-only proposal 数据，
 * 不创建、不更新、不删除任何 tldraw shape。
 */
export function createCompletionProposalOutput(input: {
  roomId: string;
  context: RoomContextFeed;
  agentTurn: AgentTurnPlan;
  basedOn: AgentOutputFreshness;
  createdAt: string;
  outputId: string;
}) {
  const selectedShape = input.context.latestSnapshot?.document.shapes.find((shape) =>
    input.context.latestSnapshot?.selection.selectedShapeIds.includes(shape.id)
  );
  const selectedShapeId = selectedShape?.id ?? "shape:unknown";

  if (input.agentTurn.toolCalls[0]?.variant === "flow-continuation") {
    return agentOutputSchema.parse({
      schemaVersion: AGENT_OUTPUT_SCHEMA_VERSION,
      kind: "completion-proposal",
      outputId: input.outputId,
      roomId: input.roomId,
      createdAt: input.createdAt,
      basedOn: input.basedOn,
      nonMutating: true,
      proposal: {
        proposalId: `${input.outputId}:completion`,
        status: "pending",
        previewOnly: true,
        requiresAcceptance: true,
        applied: false,
        completion: {
          kind: "flow-continuation",
          anchorShapeId: selectedShapeId,
          proposedNodes: [
            {
              text: "Next step",
              type: selectedShape?.type
            }
          ],
          proposedConnectors: [
            {
              fromShapeId: selectedShapeId,
              toProposedNodeIndex: 0
            }
          ]
        },
        rationale: input.agentTurn.decision.reason
      }
    });
  }

  const currentText = selectedShape?.text?.trim() ?? "";
  return agentOutputSchema.parse({
    schemaVersion: AGENT_OUTPUT_SCHEMA_VERSION,
    kind: "completion-proposal",
    outputId: input.outputId,
    roomId: input.roomId,
    createdAt: input.createdAt,
    basedOn: input.basedOn,
    nonMutating: true,
    proposal: {
      proposalId: `${input.outputId}:completion`,
      status: "pending",
      previewOnly: true,
      requiresAcceptance: true,
      applied: false,
      completion: {
        kind: "text-in-element",
        shapeId: selectedShapeId,
        currentText,
        proposedText: `${currentText} next`
      },
      rationale: input.agentTurn.decision.reason
    }
  });
}

function collectSnapshotFacts(
  gateway: GatewayRequest | undefined,
  context: RoomContextFeed
) {
  const facts: string[] = [];
  const selectedIds =
    gateway?.trigger.kind === "completion" && gateway.trigger.selection.state === "selected"
      ? gateway.trigger.selection.selectedShapeIds
      : context.latestSnapshot?.selection.selectedShapeIds ?? [];
  const shapes = context.latestSnapshot?.document.shapes ?? [];
  const selectedShapes = shapes.filter((shape) => selectedIds.includes(shape.id));

  if (selectedShapes.length > 0) {
    facts.push("selected-shape");
  }
  if (
    selectedShapes.some((shape) => shape.type === "text" && Boolean(shape.text?.trim()))
  ) {
    facts.push("selected-text-shape");
  }
  if (
    selectedShapes.some((shape) =>
      /geo|draw|arrow|connector|node|shape/i.test(shape.type)
    )
  ) {
    facts.push("selected-diagram-shape");
  }
  if (context.latestSnapshot) {
    facts.push("latest-snapshot");
  }
  return facts;
}

/**
 * gateway turn 必须使用 gateway 已经裁剪过的有序 operation stack；只有 legacy
 * turn 才回退到完整 context feed，避免旧事件绕过 gateway 的边界。
 */
function getDecisionOperations(
  gateway: GatewayRequest | undefined,
  context: RoomContextFeed
) {
  if (gateway?.context.recentOperations.state === "available") {
    return gateway.context.recentOperations.operations;
  }
  if (gateway) {
    return [];
  }
  return context.recentEvents;
}

function collectRecentOperationFacts(events: RoomOperationEvent[]) {
  const facts: string[] = [];
  const summaries = events
    .filter((event): event is Extract<RoomOperationEvent, { kind: "canvas-change" }> =>
      event.kind === "canvas-change"
    )
    .map((event) => event.summary.toLowerCase());

  facts.push(
    ...events.map((event, index) => {
      if (event.kind === "canvas-change") {
        return `operation:${index}:${event.eventId}:${event.kind}:${event.summary}`;
      }
      return `operation:${index}:${event.eventId}:${event.kind}`;
    })
  );

  if (summaries.some((summary) => /text|typing|typed|edit/.test(summary))) {
    facts.push("text-edit-operation");
  }
  if (
    summaries.some((summary) =>
      /connector|arrow|flow|node|edge|connected|adjacent/.test(summary)
    )
  ) {
    facts.push("flow-authoring-operation");
  }
  if (
    events.length > 0 &&
    events.every((event) => event.kind === "selection-change" || event.kind === "viewport-change")
  ) {
    facts.push("selection-or-viewport-only");
  }
  if (events.length > 0) {
    facts.push("recent-operations");
  }
  return facts;
}
