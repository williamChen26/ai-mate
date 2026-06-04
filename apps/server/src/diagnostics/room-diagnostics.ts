import type { CanvasSnapshot, RoomContextFeed } from "@production-spec-graph/shared";

import type {
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
    hasResponse: boolean;
    outputKind: string | null;
    proposalStatus: RoomMateOutputValidation["status"] | null;
    outputValidation: RoomMateOutputValidation | null;
    lastResponse: RoomMateResponse | null;
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

/**
 * 组装单个 room diagnostics 所需的全部状态来源。
 */
export type CreateRoomDiagnosticsInput = {
  roomId: string;
  stats: RoomRegistryStats;
  agentLifecycle: RoomAgentLifecycleDiagnostics;
  context: RoomContextFeed;
  latestMateResponse?: RoomMateResponse;
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
  latestMateResponse,
  generatedAt
}: CreateRoomDiagnosticsInput): RoomDiagnostics {
  const lifecycle =
    agentLifecycle.rooms.find((record) => record.roomId === roomId) ?? null;
  const output = latestMateResponse?.mate.output;

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
      hasResponse: Boolean(latestMateResponse),
      outputKind: output?.kind ?? null,
      proposalStatus: latestMateResponse?.outputValidation.status ?? null,
      outputValidation: latestMateResponse?.outputValidation ?? null,
      lastResponse: latestMateResponse ?? null
    },
    storage: {
      kind: "process-local-memory",
      durable: false,
      note:
        "Diagnostics are read from process-local room, context, and mate stores. Restarting the server clears this data."
    }
  };
}
