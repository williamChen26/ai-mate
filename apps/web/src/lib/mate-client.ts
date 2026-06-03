export type MateClientSource = {
  deviceId: string;
  sessionId: string;
  tabId: string;
};

export type MateClientResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

export type RoomMateClient = {
  sendMessage: (message: string) => Promise<MateClientResult>;
};

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
    }
  };
}
