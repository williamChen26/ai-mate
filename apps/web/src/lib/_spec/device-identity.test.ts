import { describe, expect, it } from "vitest";

import {
  createTabSessionId,
  getOrCreateDeviceIdentity,
  isDeviceId,
  isTabSessionId
} from "../device-identity";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("device identity", () => {
  it("creates an opaque stable id and reuses it from storage", () => {
    const storage = new MemoryStorage();
    const first = getOrCreateDeviceIdentity({
      storage,
      randomUUID: () => "11111111-1111-4111-8111-111111111111"
    });
    const second = getOrCreateDeviceIdentity({
      storage,
      randomUUID: () => "22222222-2222-4222-8222-222222222222"
    });

    expect(first).toEqual({
      deviceId: "psg-device-11111111-1111-4111-8111-111111111111",
      created: true,
      persisted: true
    });
    expect(second).toEqual({
      deviceId: first.deviceId,
      created: false,
      persisted: true
    });
    expect(isDeviceId(first.deviceId)).toBe(true);
  });

  it("creates different ids for independent storage profiles", () => {
    const first = getOrCreateDeviceIdentity({
      storage: new MemoryStorage(),
      randomUUID: () => "11111111-1111-4111-8111-111111111111"
    });
    const second = getOrCreateDeviceIdentity({
      storage: new MemoryStorage(),
      randomUUID: () => "22222222-2222-4222-8222-222222222222"
    });

    expect(first.deviceId).not.toBe(second.deviceId);
  });

  it("replaces invalid stored values", () => {
    const storage = new MemoryStorage();
    storage.setItem("psg.device-id.v1", "chenweimin@example.com");

    const result = getOrCreateDeviceIdentity({
      storage,
      randomUUID: () => "33333333-3333-4333-8333-333333333333"
    });

    expect(result.deviceId).toBe(
      "psg-device-33333333-3333-4333-8333-333333333333"
    );
    expect(result.created).toBe(true);
  });

  it("falls back to an ephemeral id when storage is unavailable", () => {
    const result = getOrCreateDeviceIdentity({
      storage: null,
      randomUUID: () => "44444444-4444-4444-8444-444444444444"
    });

    expect(result).toEqual({
      deviceId: "psg-device-44444444-4444-4444-8444-444444444444",
      created: true,
      persisted: false
    });
  });

  it("creates independent per-tab session ids", () => {
    const tabId = createTabSessionId(
      () => "55555555-5555-4555-8555-555555555555"
    );

    expect(tabId).toBe("tab-55555555-5555-4555-8555-555555555555");
    expect(isTabSessionId(tabId)).toBe(true);
  });
});
