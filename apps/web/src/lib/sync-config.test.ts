import { describe, expect, it } from "vitest";

import {
  buildSyncRoomUri,
  buildSyncSessionId,
  DEFAULT_SYNC_SERVER_URL,
  resolveSyncConfig
} from "./sync-config";

const deviceId = "psg-device-11111111-1111-4111-8111-111111111111";
const tabId = "tab-22222222-2222-4222-8222-222222222222";

describe("sync config", () => {
  it("builds the F1 backend room uri from an HTTP server URL", () => {
    const result = buildSyncRoomUri({
      serverUrl: "http://127.0.0.1:3001",
      roomId: "alpha-room"
    });

    expect(result).toEqual({
      ok: true,
      value: "ws://127.0.0.1:3001/sync/alpha-room"
    });
  });

  it("preserves explicit websocket protocol and nested backend paths", () => {
    const result = buildSyncRoomUri({
      serverUrl: "wss://sync.example.test/api/",
      roomId: "product.spec_1"
    });

    expect(result).toEqual({
      ok: true,
      value: "wss://sync.example.test/api/sync/product.spec_1"
    });
  });

  it("constructs an allowed session id from device and tab ids", () => {
    expect(buildSyncSessionId(deviceId, tabId)).toBe(`${deviceId}:${tabId}`);
  });

  it("resolves an explicit route-backed local collaboration room", () => {
    const result = resolveSyncConfig({
      deviceId,
      tabId,
      serverUrl: DEFAULT_SYNC_SERVER_URL,
      roomId: "route-backed-room"
    });

    expect(result).toEqual({
      ok: true,
      value: {
        roomId: "route-backed-room",
        roomUri: "ws://127.0.0.1:3001/sync/route-backed-room",
        sessionId: `${deviceId}:${tabId}`
      }
    });
  });

  it("rejects unsafe room ids before they reach the backend", () => {
    const result = resolveSyncConfig({
      deviceId,
      tabId,
      serverUrl: DEFAULT_SYNC_SERVER_URL,
      roomId: "../etc/passwd"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_ROOM_ID" }
    });
  });

  it("rejects invalid or hosted-demo sync URLs", () => {
    expect(
      resolveSyncConfig({
        deviceId,
        tabId,
        roomId: "route-backed-room"
      })
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_SERVER_URL" }
    });

    expect(
      resolveSyncConfig({
        deviceId,
        tabId,
        serverUrl: "file:///tmp/sync",
        roomId: "route-backed-room"
      })
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_SERVER_URL" }
    });

    expect(
      resolveSyncConfig({
        deviceId,
        tabId,
        serverUrl: "https://demo.tldraw.xyz",
        roomId: "route-backed-room"
      })
    ).toMatchObject({
      ok: false,
      error: { code: "HOSTED_DEMO_SYNC_URL" }
    });
  });

  it("rejects malformed session ids", () => {
    const result = resolveSyncConfig({
      deviceId: "bad/device",
      tabId,
      serverUrl: DEFAULT_SYNC_SERVER_URL,
      roomId: "route-backed-room"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_SESSION_ID" }
    });
  });

  it("rejects missing room ids because routes must provide room identity", () => {
    const result = resolveSyncConfig({
      deviceId,
      tabId,
      serverUrl: DEFAULT_SYNC_SERVER_URL
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_ROOM_ID" }
    });
  });
});
