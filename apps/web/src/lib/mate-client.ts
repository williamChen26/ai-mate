import type { CanvasSnapshot } from "@production-spec-graph/shared";

/**
 * 附加到手动 mate messages 上的浏览器/session 元数据。
 */
export type MateClientSource = {
  deviceId: string;
  sessionId: string;
  tabId: string;
};

/**
 * mate message endpoint 返回的标准化 raw result。
 */
export type MateClientResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

/**
 * raw Mate 面板使用的最小 client API。
 */
export type RoomMateClient = {
  sendMessage: (message: string) => Promise<MateClientResult>;
  requestCompletion: (snapshot: CanvasSnapshot) => Promise<MateClientResult>;
};

/**
 * 为 `POST /rooms/:roomId/mate/messages` 创建 room 级 client。
 *
 * client 不解释 mate output，只返回 raw JSON，让当前 UI 先验证 server -> mate -> web
 * 链路，再考虑产品样式。
 */
export function createRoomMateClient(input: {
  baseUrl: string;
  roomId: string;
  source: MateClientSource;
  fetch?: typeof globalThis.fetch;
  now?: () => string;
}): RoomMateClient {
  const fetcher = input.fetch ?? globalThis.fetch.bind(globalThis);
  const baseUrl = input.baseUrl.replace(/\/$/, "");
  const roomPath = encodeURIComponent(input.roomId);
  const now = input.now ?? (() => new Date().toISOString());

  return {
    async sendMessage(message) {
      const response = await fetcher(
        `${baseUrl}/rooms/${roomPath}/mate/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message,
            source: {
              kind: "web",
              ...input.source,
              sentAt: now()
            }
          })
        }
      ).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false as const, error: message };
      });

      if ("error" in response) {
        return { ok: false, error: response.error };
      }

      const value = await response.json().catch(() => null);
      if (!response.ok) {
        return {
          ok: false,
          error:
            typeof value?.error?.message === "string"
              ? value.error.message
              : `Request failed with status ${response.status}`
        };
      }
      return { ok: true, value };
    },

    async requestCompletion(snapshot) {
      const response = await fetcher(
        `${baseUrl}/rooms/${roomPath}/mate/completions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            selection:
              snapshot.selection.selectedShapeIds.length > 0
                ? {
                    state: "selected",
                    selectedShapeIds: snapshot.selection.selectedShapeIds
                  }
                : {
                    state: "empty",
                    selectedShapeIds: []
                  },
            viewport: {
              state: "available",
              pageBounds: snapshot.viewport.pageBounds,
              zoom: snapshot.viewport.zoom
            },
            source: snapshot.source
          })
        }
      ).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false as const, error: message };
      });

      if ("error" in response) {
        return { ok: false, error: response.error };
      }

      const value = await response.json().catch(() => null);
      if (!response.ok) {
        return {
          ok: false,
          error:
            typeof value?.error?.message === "string"
              ? value.error.message
              : `Request failed with status ${response.status}`
        };
      }
      return { ok: true, value };
    }
  };
}
