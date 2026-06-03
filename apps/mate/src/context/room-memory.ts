export type MateTurnMemory = {
  turnId: string;
  generatedAt: string;
  summary: string;
};

export type RoomMemoryDiagnostics = {
  retainedTurnCount: number;
  maxTurnsPerRoom: number;
  persistent: false;
};

export type RoomMemoryStore = {
  recordTurn: (roomId: string, turn: MateTurnMemory) => void;
  getTurns: (roomId: string) => MateTurnMemory[];
  getDiagnostics: (roomId: string) => RoomMemoryDiagnostics;
};

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
