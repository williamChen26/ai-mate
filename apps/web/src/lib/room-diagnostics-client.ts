/**
 * room diagnostics endpoint 返回的标准化 raw result。
 */
export type RoomDiagnosticsClientResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

/**
 * raw Mate 面板 Diagnostics 按钮使用的最小 client API。
 */
export type RoomDiagnosticsClient = {
  fetchDiagnostics: () => Promise<RoomDiagnosticsClientResult>;
};

/**
 * 为 `GET /rooms/:roomId/diagnostics` 创建 room 级 client。
 *
 * diagnostics 刻意以 `unknown` raw JSON 返回，因为这个 surface 面向开发者，
 * 直接镜像 backend response。
 */
export function createRoomDiagnosticsClient(input: {
  baseUrl: string;
  roomId: string;
  fetch?: typeof globalThis.fetch;
}): RoomDiagnosticsClient {
  const fetcher = input.fetch ?? globalThis.fetch.bind(globalThis);
  const baseUrl = input.baseUrl.replace(/\/$/, "");
  const roomPath = encodeURIComponent(input.roomId);

  return {
    async fetchDiagnostics() {
      const response = await fetcher(
        `${baseUrl}/rooms/${roomPath}/diagnostics`
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
