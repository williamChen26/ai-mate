import {
  agentOutputSchema,
  type AgentOutputFreshness,
  type CanvasShapeSnapshot,
  type CanvasSnapshot,
  type CompletionProposalOutput
} from "@production-spec-graph/shared";

export type AiDropRuntimeContext = {
  snapshot: CanvasSnapshot;
  freshness?: AgentOutputFreshness;
};

export type AiDropPreview =
  | {
      kind: "text-in-element";
      targetShapeId: string;
      text: string;
      bounds: PreviewBounds;
    }
  | {
      kind: "flow-continuation";
      targetShapeId: string;
      nodes: Array<{ text: string; type?: string }>;
      bounds: PreviewBounds;
    };

export type PreviewBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ActiveAiDropProposal = {
  status: "active";
  output: CompletionProposalOutput;
  proposalId: string;
  targetShapeId: string;
  contextFingerprint: AiDropContextFingerprint;
  preview: AiDropPreview;
};

export type ApplyingAiDropProposal = {
  status: "applying";
  active: ActiveAiDropProposal;
};

export type AiDropProposalState =
  | { status: "cleared"; reason?: string }
  | ActiveAiDropProposal
  | { status: "stale"; reason: string; proposalId?: string }
  | { status: "refused"; reason: string; proposalId?: string }
  | ApplyingAiDropProposal
  | { status: "applied"; proposalId: string; appliedShapeIds: string[] }
  | { status: "failed"; reason: string; proposalId?: string };

export type AiDropApplyResult =
  | { ok: true; appliedShapeIds: string[] }
  | { ok: false; reason: string };

export type AiDropApplyBoundary = (
  active: ActiveAiDropProposal
) => Promise<AiDropApplyResult> | AiDropApplyResult;

export type AiDropDiagnostics = {
  path: "ai-drop";
  lifecycleStatus:
    | "idle"
    | "preview"
    | "applying"
    | "applied"
    | "stale"
    | "refused"
    | "failed";
  outputKind?: "completion-proposal";
  proposalId?: string;
  targetShapeId?: string;
  preview: {
    active: boolean;
    kind?: AiDropPreview["kind"];
  };
  freshness?: {
    snapshotVersion: number;
    eventVersion: number;
    stale: boolean;
  };
  acceptance: {
    tabOwned: boolean;
    state: "none" | "available" | "applying" | "applied" | "refused" | "failed";
  };
  appliedShapeIds: string[];
  refusalReason?: string;
  safety: {
    previewOnly: boolean;
    requiresAcceptance: boolean;
    applied: boolean;
    hiddenCanvasMutation: false;
  };
  bounded: {
    storesPromptText: false;
    storesFullPromptHistory: false;
    durable: false;
  };
};

type AiDropContextFingerprint = {
  roomId: string;
  snapshotVersion: number;
  eventVersion: number;
  selectedShapeIds: string[];
};

/**
 * AI Drop 的候选入口：只接受 Sprint 2 的 completion-proposal，并在进入 UI 前
 * 校验 freshness、selection 和目标 shape，避免把 agent 输出直接当成画布命令。
 */
export function activateAiDropProposal(
  output: unknown,
  context: AiDropRuntimeContext
): AiDropProposalState {
  const parsed = agentOutputSchema.safeParse(output);

  if (!parsed.success) {
    return { status: "refused", reason: "malformed-output" };
  }

  if (parsed.data.kind !== "completion-proposal") {
    return { status: "refused", reason: "unsupported-output" };
  }

  if (parsed.data.proposal.status !== "pending") {
    return {
      status: "refused",
      reason: `proposal-${parsed.data.proposal.status}`,
      proposalId: parsed.data.proposal.proposalId
    };
  }

  const active = createActiveProposal(parsed.data, context);
  return validateActiveProposal(active, context) ?? active;
}

/**
 * 清空候选态。Escape、接受成功、selection 变更等场景都走这个显式状态，而不是
 * 静默丢弃，方便测试和后续 diagnostics 解释发生了什么。
 */
export function clearAiDropProposal(reason?: string): AiDropProposalState {
  return reason ? { status: "cleared", reason } : { status: "cleared" };
}

/**
 * 生成 web-local AI Drop diagnostics。AI Drop 预览是未同步的浏览器态，所以这里
 * 只总结 proposal lifecycle，不把它伪装成 server room diagnostics。
 */
export function createAiDropDiagnostics(
  state: AiDropProposalState
): AiDropDiagnostics {
  const active =
    state.status === "active"
      ? state
      : state.status === "applying"
        ? state.active
        : null;
  const base = {
    path: "ai-drop" as const,
    preview: {
      active: state.status === "active",
      ...(active ? { kind: active.preview.kind } : {})
    },
    appliedShapeIds: state.status === "applied" ? state.appliedShapeIds : [],
    safety: {
      previewOnly: active?.output.proposal.previewOnly ?? true,
      requiresAcceptance: active?.output.proposal.requiresAcceptance ?? true,
      applied: state.status === "applied",
      hiddenCanvasMutation: false as const
    },
    bounded: {
      storesPromptText: false as const,
      storesFullPromptHistory: false as const,
      durable: false as const
    }
  };

  if (state.status === "active") {
    return {
      ...base,
      lifecycleStatus: "preview",
      outputKind: state.output.kind,
      proposalId: state.proposalId,
      targetShapeId: state.targetShapeId,
      freshness: summarizeFreshness(state.output.basedOn),
      acceptance: { tabOwned: true, state: "available" }
    };
  }

  if (state.status === "applying") {
    return {
      ...base,
      lifecycleStatus: "applying",
      outputKind: state.active.output.kind,
      proposalId: state.active.proposalId,
      targetShapeId: state.active.targetShapeId,
      freshness: summarizeFreshness(state.active.output.basedOn),
      acceptance: { tabOwned: true, state: "applying" }
    };
  }

  if (state.status === "applied") {
    return {
      ...base,
      lifecycleStatus: "applied",
      proposalId: state.proposalId,
      acceptance: { tabOwned: false, state: "applied" }
    };
  }

  if (state.status === "failed") {
    return {
      ...base,
      lifecycleStatus: "failed",
      ...(state.proposalId ? { proposalId: state.proposalId } : {}),
      refusalReason: state.reason,
      acceptance: { tabOwned: false, state: "failed" }
    };
  }

  if (state.status === "stale" || state.status === "refused") {
    return {
      ...base,
      lifecycleStatus: state.status,
      ...(state.proposalId ? { proposalId: state.proposalId } : {}),
      refusalReason: state.reason,
      acceptance: { tabOwned: false, state: "refused" }
    };
  }

  return {
    ...base,
    lifecycleStatus: "idle",
    acceptance: { tabOwned: false, state: "none" }
  };
}

/**
 * Tab 接受的第一道门：重新验证当前上下文，只有 active 且仍然匹配的 proposal
 * 才能进入 applying 状态。
 */
export function beginAiDropProposalApply(
  state: AiDropProposalState,
  context: AiDropRuntimeContext
): AiDropProposalState {
  if (state.status !== "active") {
    return { status: "refused", reason: "no-active-proposal" };
  }

  const refusal = validateActiveProposal(state, context);
  if (refusal) {
    return refusal;
  }

  return { status: "applying", active: state };
}

/**
 * 轻量刷新候选态。React 层可以在 selection 或 snapshot 变化后调用它，让过期候选
 * 变成明确的 stale/refused 状态，而不是继续显示一个可能会误导用户的预览。
 */
export function refreshAiDropProposalState(
  state: AiDropProposalState,
  context: AiDropRuntimeContext
): AiDropProposalState {
  if (state.status !== "active") {
    return state;
  }

  return validateActiveProposal(state, context) ?? state;
}

/**
 * 把受控 apply boundary 的结果折回 proposal 状态。这里不直接操作 editor，只记录
 * “画布边界是否成功执行”，保持状态机和 tldraw 适配器解耦。
 */
export function finishAiDropProposalApply(
  state: AiDropProposalState,
  result: AiDropApplyResult
): AiDropProposalState {
  if (state.status !== "applying") {
    return { status: "refused", reason: "no-applying-proposal" };
  }

  if (!result.ok) {
    return {
      status: "failed",
      reason: result.reason,
      proposalId: state.active.proposalId
    };
  }

  return {
    status: "applied",
    proposalId: state.active.proposalId,
    appliedShapeIds: result.appliedShapeIds
  };
}

/**
 * Tab 快捷入口：先进入 applying，再调用唯一允许变更画布的 apply boundary。
 */
export async function acceptAiDropProposal(
  state: AiDropProposalState,
  context: AiDropRuntimeContext,
  apply: AiDropApplyBoundary
): Promise<AiDropProposalState> {
  const applying = beginAiDropProposalApply(state, context);
  if (applying.status !== "applying") {
    return applying;
  }

  return finishAiDropProposalApply(applying, await apply(applying.active));
}

/**
 * 基于当前 snapshot 提供预览锚点。bounds 缺失时用 viewport 左上附近兜底，保证
 * 候选仍可被测试和人工观察到，但不会把预览写进 tldraw store。
 */
export function createAiDropPreview(
  output: CompletionProposalOutput,
  context: AiDropRuntimeContext
): AiDropPreview {
  const completion = output.proposal.completion;
  const targetShapeId =
    completion.kind === "text-in-element"
      ? completion.shapeId
      : completion.anchorShapeId;
  const target = findShape(context.snapshot, targetShapeId);
  const bounds =
    target?.bounds ??
    ({
      x: context.snapshot.viewport.pageBounds.x + 48,
      y: context.snapshot.viewport.pageBounds.y + 48,
      w: 220,
      h: 56
    } satisfies PreviewBounds);

  if (completion.kind === "flow-continuation") {
    return {
      kind: "flow-continuation",
      targetShapeId,
      nodes: completion.proposedNodes.map((node) =>
        node.type ? { text: node.text, type: node.type } : { text: node.text }
      ),
      bounds: { x: bounds.x + bounds.w + 32, y: bounds.y, w: 220, h: 64 }
    };
  }

  return {
    kind: "text-in-element",
    targetShapeId,
    text: completion.proposedText,
    bounds: { x: bounds.x, y: bounds.y + bounds.h + 12, w: bounds.w, h: 56 }
  };
}

function createActiveProposal(
  output: CompletionProposalOutput,
  context: AiDropRuntimeContext
): ActiveAiDropProposal {
  const completion = output.proposal.completion;
  const targetShapeId =
    completion.kind === "text-in-element"
      ? completion.shapeId
      : completion.anchorShapeId;

  return {
    status: "active",
    output,
    proposalId: output.proposal.proposalId,
    targetShapeId,
    contextFingerprint: createContextFingerprint(context),
    preview: createAiDropPreview(output, context)
  };
}

/**
 * 重新验证 active proposal。这里故意只使用小而明确的事实：room、freshness、
 * 当前 selection 和目标 shape 是否存在，避免 web 侧重复实现 agent 推理。
 */
function validateActiveProposal(
  active: ActiveAiDropProposal,
  context: AiDropRuntimeContext
): AiDropProposalState | null {
  const current = createContextFingerprint(context);

  if (active.output.basedOn.stale || current.roomId !== active.output.roomId) {
    return { status: "stale", reason: "freshness-stale", proposalId: active.proposalId };
  }

  if (
    current.snapshotVersion !== active.output.basedOn.snapshotVersion ||
    current.eventVersion !== active.output.basedOn.eventVersion ||
    context.freshness?.changedSinceSnapshot
  ) {
    return {
      status: "stale",
      reason: "freshness-mismatch",
      proposalId: active.proposalId
    };
  }

  if (!findShape(context.snapshot, active.targetShapeId)) {
    return {
      status: "refused",
      reason: "target-shape-missing",
      proposalId: active.proposalId
    };
  }

  if (!current.selectedShapeIds.includes(active.targetShapeId)) {
    return {
      status: "refused",
      reason: "selection-mismatch",
      proposalId: active.proposalId
    };
  }

  const shape = findShape(context.snapshot, active.targetShapeId);
  const completion = active.output.proposal.completion;
  if (
    shape &&
    completion.kind === "text-in-element" &&
    (shape.text ?? "") !== completion.currentText
  ) {
    return {
      status: "stale",
      reason: "target-text-changed",
      proposalId: active.proposalId
    };
  }

  return null;
}

function createContextFingerprint(
  context: AiDropRuntimeContext
): AiDropContextFingerprint {
  const freshness = context.freshness ?? {
    snapshotVersion: context.snapshot.freshness.snapshotVersion,
    eventVersion: context.snapshot.freshness.eventVersionAtSnapshot
  };

  return {
    roomId: context.snapshot.roomId,
    snapshotVersion: freshness.snapshotVersion,
    eventVersion: freshness.eventVersion,
    selectedShapeIds: [...context.snapshot.selection.selectedShapeIds].sort()
  };
}

function findShape(
  snapshot: CanvasSnapshot,
  shapeId: string
): CanvasShapeSnapshot | null {
  return snapshot.document.shapes.find((shape) => shape.id === shapeId) ?? null;
}

function summarizeFreshness(freshness: AgentOutputFreshness) {
  return {
    snapshotVersion: freshness.snapshotVersion,
    eventVersion: freshness.eventVersion,
    stale: freshness.stale
  };
}
