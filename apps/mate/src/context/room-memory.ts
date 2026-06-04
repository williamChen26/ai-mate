/**
 * 每次 mate turn 后保留的精简 memory 条目。summary 刻意保持很小，因为这个 store
 * 只是本地边界，不是持久对话历史。
 */
export type MateTurnMemory = {
  turnId: string;
  generatedAt: string;
  summary: string;
};

/**
 * 随 mate turn 返回的 diagnostics，用来显式说明本地 memory 限制。
 */
export type RoomMemoryDiagnostics = {
  retainedTurnCount: number;
  maxTurnsPerRoom: number;
  persistent: false;
};

/**
 * `prepareMateTurn` 使用的 room 级 memory 抽象。
 */
export type RoomMemoryStore = {
  recordTurn: (roomId: string, turn: MateTurnMemory) => void;
  getTurns: (roomId: string) => MateTurnMemory[];
  getDiagnostics: (roomId: string) => RoomMemoryDiagnostics;
};

/**
 * 为 mate turns 创建有边界的 process-local memory store。
 *
 * 每个 room 只保留最近 `maxTurnsPerRoom` 条 summary，并报告 `persistent: false`，
 * 避免调用方误以为这是持久 memory。
 */
export function createRoomMemoryStore({
  maxTurnsPerRoom = 5
}: {
  maxTurnsPerRoom?: number;
} = {}): RoomMemoryStore {
  const turnsByRoom = new Map<string, MateTurnMemory[]>();

  return {
    recordTurn(roomId, turn) {
      const turns = turnsByRoom.get(roomId) ?? [];
      turnsByRoom.set(roomId, [...turns, turn].slice(-maxTurnsPerRoom));
    },

    getTurns(roomId) {
      return [...(turnsByRoom.get(roomId) ?? [])];
    },

    getDiagnostics(roomId) {
      return {
        retainedTurnCount: turnsByRoom.get(roomId)?.length ?? 0,
        maxTurnsPerRoom,
        persistent: false
      };
    }
  };
}
