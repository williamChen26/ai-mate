import type {
  CanvasSnapshot,
  GatewayRequest,
  RoomContextFeed
} from "@production-spec-graph/shared";

import type {
  RoomMateDiagnosticRecord,
  RoomMateFailureDiagnostics,
  RoomMateOutputValidation,
  RoomMateResponse
} from "../mate/room-mate-service.js";
import type {
  RoomAgentLifecycleRecord,
  RoomAgentLifecycleDiagnostics
} from "../sync/room-agent-lifecycle.js";
import type { RoomRegistryStats } from "../sync/room-registry.js";

/**
 * 面向开发者的 room diagnostics 响应。
 *
 * 它刻意只聚合 process-local runtime 状态，而不是产品分析或观测后端。它回答：
 * room 是否存在、mate 会看到什么 context、mate 最近返回了什么、storage 是否持久。
 */
export type RoomDiagnostics = {
  roomId: string;
  generatedAt: string;
  room: {
    active: boolean;
    knownRoomIds: string[];
  };
  agentLifecycle: RoomAgentLifecycleRecord | null;
  context: {
    hasSnapshot: boolean;
    snapshotShapeCount: number;
    recentEventCount: number;
    freshness: RoomContextFeed["freshness"];
    latestSnapshot: RoomDiagnosticsSnapshotSummary | null;
  };
  mate: {
    hasDiagnostic: boolean;
    hasResponse: boolean;
    outputKind: string | null;
    proposalStatus: RoomMateOutputValidation["status"] | null;
    gatewaySummary: RoomDiagnosticsGatewaySummary | null;
    outputValidation: RoomMateOutputValidation | null;
    failure: RoomDiagnosticsFailureSummary | null;
    lastResponse: unknown | null;
  };
  storage: {
    kind: "process-local-memory";
    durable: false;
    note: string;
  };
};

/**
 * diagnostics 使用的小型 snapshot 摘要。它避免回显完整 snapshot，同时保留开发者
 * 验证 freshness 和浏览器/session 来源所需字段。
 */
export type RoomDiagnosticsSnapshotSummary = {
  source: CanvasSnapshot["source"];
  shapeCount: number;
  selectedShapeCount: number;
  freshness: {
    snapshotVersion: number;
    eventVersionAtSnapshot: number;
  };
};

export type RoomDiagnosticsGatewaySummary = {
  requestId: string;
  triggerKind: GatewayRequest["trigger"]["kind"];
  createdAt: string;
  contextFreshness: GatewayRequest["context"]["freshness"];
  intentReadiness: GatewayRequest["context"]["intentReadiness"];
  snapshot: {
    state: GatewayRequest["context"]["snapshot"]["state"];
    shapeCount: number | null;
    selectedShapeCount: number | null;
  };
  recentOperations: {
    state: GatewayRequest["context"]["recentOperations"]["state"];
    count: number;
    boundedTo: number | null;
  };
  chatBoundaryState: string | null;
  agentTurn: {
    decisionIntent: string;
    toolCallCount: number;
    toolCalls: Array<{
      toolName: string;
      variant?: string;
      status?: string;
    }>;
    finalOutputKind: string;
  };
  runtime: {
    mode: string;
    path: string;
    agentId: string;
    outputSource: string;
    status: string;
    fallbackUsed: boolean;
    provider?: {
      provider: string;
      ready: boolean;
      reason?: string;
    };
    toolCallCount: number;
    toolCalls: Array<{
      toolName: string;
      status: string;
      outputKind?: string;
      previewOnly?: boolean;
      reason?: string;
    }>;
    reason?: string;
  } | null;
  outputKind: string;
  outputValidation: {
    status: RoomMateOutputValidation["status"];
    applied: false;
    reason?: string;
  };
  bounded: {
    storesPromptText: false;
    storesFullPromptHistory: false;
    durable: false;
    recentOperationCount: number;
  };
};

export type RoomDiagnosticsFailureSummary = {
  code: string;
  message: string;
  bounded: {
    storesRawAgentOutput: false;
    storesPromptText: false;
    storesFullPromptHistory: false;
  };
};

/**
 * 组装单个 room diagnostics 所需的全部状态来源。
 */
export type CreateRoomDiagnosticsInput = {
  roomId: string;
  stats: RoomRegistryStats;
  agentLifecycle: RoomAgentLifecycleDiagnostics;
  context: RoomContextFeed;
  latestMateRecord?: RoomMateDiagnosticRecord;
  generatedAt: string;
};

/**
 * 将 room registry、agent lifecycle、context store 和最新 mate response 聚合成
 * 一个 raw diagnostics 对象。
 */
export function createRoomDiagnostics({
  roomId,
  stats,
  agentLifecycle,
  context,
  latestMateRecord,
  generatedAt
}: CreateRoomDiagnosticsInput): RoomDiagnostics {
  const lifecycle =
    agentLifecycle.rooms.find((record) => record.roomId === roomId) ?? null;
  const latestMateResponse = isMateResponse(latestMateRecord)
    ? latestMateRecord
    : null;
  const latestMateFailure = isMateFailure(latestMateRecord)
    ? latestMateRecord
    : null;
  const output = latestMateResponse?.mate.output;
  const outputValidation = latestMateRecord?.outputValidation ?? null;

  return {
    roomId,
    generatedAt,
    room: {
      active: stats.roomIds.includes(roomId),
      knownRoomIds: stats.roomIds
    },
    agentLifecycle: lifecycle,
    context: {
      hasSnapshot: Boolean(context.latestSnapshot),
      snapshotShapeCount: context.latestSnapshot?.document.shapeCount ?? 0,
      recentEventCount: context.recentEvents.length,
      freshness: context.freshness,
      latestSnapshot: context.latestSnapshot
        ? {
            source: context.latestSnapshot.source,
            shapeCount: context.latestSnapshot.document.shapeCount,
            selectedShapeCount:
              context.latestSnapshot.selection.selectedShapeIds.length,
            freshness: context.latestSnapshot.freshness
          }
        : null
    },
    mate: {
      hasDiagnostic: Boolean(latestMateRecord),
      hasResponse: Boolean(latestMateResponse),
      outputKind: output?.kind ?? null,
      proposalStatus: outputValidation?.status ?? null,
      gatewaySummary: latestMateResponse
        ? createGatewaySummary(latestMateResponse)
        : latestMateFailure
          ? createFailureGatewaySummary(latestMateFailure)
        : null,
      outputValidation,
      failure: latestMateFailure
        ? {
            code: latestMateFailure.error.code,
            message: latestMateFailure.error.message,
            bounded: latestMateFailure.bounded
          }
        : null,
      lastResponse: latestMateResponse
        ? sanitizeMateResponseForDiagnostics(latestMateResponse)
        : latestMateFailure
          ? sanitizeMateFailureForDiagnostics(latestMateFailure)
        : null
    },
    storage: {
      kind: "process-local-memory",
      durable: false,
      note:
        "Diagnostics are read from process-local room, context, and mate stores. Restarting the server clears this data."
    }
  };
}

/**
 * 生成 bounded gateway 摘要。它保留排查路由、freshness、agent 决策和输出安全性
 * 所需字段，但不复制用户完整消息或 prompt history。
 */
function createGatewaySummary(
  response: RoomMateResponse
): RoomDiagnosticsGatewaySummary {
  const snapshot = response.gateway.context.snapshot;
  const recentOperations = response.gateway.context.recentOperations;
  const outputValidation = response.outputValidation;

  return {
    requestId: response.gateway.requestId,
    triggerKind: response.gateway.trigger.kind,
    createdAt: response.gateway.createdAt,
    contextFreshness: response.gateway.context.freshness,
    intentReadiness: response.gateway.context.intentReadiness,
    snapshot: {
      state: snapshot.state,
      shapeCount:
        snapshot.state === "available" ? snapshot.snapshot.document.shapeCount : null,
      selectedShapeCount:
        snapshot.state === "available"
          ? snapshot.snapshot.selection.selectedShapeIds.length
          : null
    },
    recentOperations: {
      state: recentOperations.state,
      count: recentOperations.operations.length,
      boundedTo:
        recentOperations.source.origin === "server-context-feed"
          ? recentOperations.source.boundedTo ?? null
          : null
    },
    chatBoundaryState: response.gateway.context.chatBoundary?.state ?? null,
    agentTurn: {
      decisionIntent: response.mate.agentTurn.decision.intent,
      toolCallCount: response.mate.agentTurn.toolCalls.length,
      toolCalls: response.mate.agentTurn.toolCalls.map((toolCall) => ({
        toolName: toolCall.toolName,
        ...(toolCall.variant ? { variant: toolCall.variant } : {}),
        ...(toolCall.status ? { status: toolCall.status } : {})
      })),
      finalOutputKind: response.mate.agentTurn.finalOutputKind
    },
    runtime: summarizeRuntime(response.mate.runtime),
    outputKind: response.mate.output.kind,
    outputValidation: {
      status: outputValidation.status,
      applied: false,
      ...(outputValidation.reason ? { reason: outputValidation.reason } : {})
    },
    bounded: {
      storesPromptText: false,
      storesFullPromptHistory: false,
      durable: false,
      recentOperationCount: recentOperations.operations.length
    }
  };
}

function summarizeRuntime(
  runtime: RoomMateResponse["mate"]["runtime"]
): RoomDiagnosticsGatewaySummary["runtime"] {
  const provider = runtime.provider
    ? {
        provider: runtime.provider.provider,
        ready: runtime.provider.ready,
        ...(runtime.provider.reason ? { reason: runtime.provider.reason } : {})
      }
    : null;
  return {
    mode: runtime.mode,
    path: runtime.path,
    agentId: runtime.agentId,
    outputSource: runtime.outputSource,
    status: runtime.status,
    fallbackUsed: runtime.fallbackUsed,
    ...(provider ? { provider } : {}),
    toolCallCount: runtime.toolCallCount,
    toolCalls: runtime.toolCalls.map((toolCall) => ({
      toolName: toolCall.toolName,
      status: toolCall.status,
      ...(toolCall.outputKind ? { outputKind: toolCall.outputKind } : {}),
      ...(toolCall.previewOnly === undefined
        ? {}
        : { previewOnly: toolCall.previewOnly }),
      ...(toolCall.reason ? { reason: toolCall.reason } : {})
    })),
    ...(runtime.reason ? { reason: runtime.reason } : {})
  };
}

function createFailureGatewaySummary(
  record: RoomMateFailureDiagnostics
): RoomDiagnosticsGatewaySummary {
  const snapshot = record.gateway.context.snapshot;
  const recentOperations = record.gateway.context.recentOperations;
  const outputValidation = record.outputValidation;

  return {
    requestId: record.gateway.requestId,
    triggerKind: record.gateway.trigger.kind,
    createdAt: record.gateway.createdAt,
    contextFreshness: record.gateway.context.freshness,
    intentReadiness: record.gateway.context.intentReadiness,
    snapshot: {
      state: snapshot.state,
      shapeCount:
        snapshot.state === "available" ? snapshot.snapshot.document.shapeCount : null,
      selectedShapeCount:
        snapshot.state === "available"
          ? snapshot.snapshot.selection.selectedShapeIds.length
          : null
    },
    recentOperations: {
      state: recentOperations.state,
      count: recentOperations.operations.length,
      boundedTo:
        recentOperations.source.origin === "server-context-feed"
          ? recentOperations.source.boundedTo ?? null
          : null
    },
    chatBoundaryState: record.gateway.context.chatBoundary?.state ?? null,
    agentTurn: {
      decisionIntent: "unavailable",
      toolCallCount: 0,
      toolCalls: [],
      finalOutputKind: "invalid"
    },
    runtime: null,
    outputKind: "invalid",
    outputValidation: {
      status: outputValidation.status,
      applied: false,
      ...(outputValidation.reason ? { reason: outputValidation.reason } : {})
    },
    bounded: {
      storesPromptText: false,
      storesFullPromptHistory: false,
      durable: false,
      recentOperationCount: recentOperations.operations.length
    }
  };
}

/**
 * diagnostics 兼容保留 latest response 结构，但 conversation trigger 的完整 message
 * 会被 messageLength 替代，避免 diagnostics 变成 prompt 文本存储点。
 */
function sanitizeMateResponseForDiagnostics(response: RoomMateResponse): unknown {
  const clone = JSON.parse(JSON.stringify(response)) as {
    gateway?: { trigger?: { kind?: string; message?: string; messageLength?: number } };
    mate?: {
      output?: {
        kind?: string;
        proposal?: {
          action?: { text?: string; textLength?: number };
        };
      };
    };
  };
  const trigger = clone.gateway?.trigger;
  if (trigger?.kind === "conversation" && typeof trigger.message === "string") {
    trigger.messageLength = trigger.message.length;
    delete trigger.message;
  }
  const action = clone.mate?.output?.proposal?.action;
  if (typeof action?.text === "string") {
    action.textLength = action.text.length;
    delete action.text;
  }
  return clone;
}

function sanitizeMateFailureForDiagnostics(record: RoomMateFailureDiagnostics): unknown {
  const clone = JSON.parse(JSON.stringify(record)) as {
    gateway?: { trigger?: { kind?: string; message?: string; messageLength?: number } };
  };
  const trigger = clone.gateway?.trigger;
  if (trigger?.kind === "conversation" && typeof trigger.message === "string") {
    trigger.messageLength = trigger.message.length;
    delete trigger.message;
  }
  return clone;
}

function isMateResponse(
  record: RoomMateDiagnosticRecord | undefined
): record is RoomMateResponse {
  return Boolean(record && !("diagnosticKind" in record));
}

function isMateFailure(
  record: RoomMateDiagnosticRecord | undefined
): record is RoomMateFailureDiagnostics {
  return Boolean(record && "diagnosticKind" in record && record.diagnosticKind === "failure");
}
