import { describe, expect, it } from "vitest";

import {
  createCollaboratorIdentity,
  createSessionDiagnostics
} from "../collaborator-identity";

describe("collaborator identity", () => {
  const firstDevice =
    "psg-device-11111111-1111-4111-8111-111111111111";
  const secondDevice =
    "psg-device-22222222-2222-4222-8222-222222222222";

  it("creates a stable privacy-safe display cue from a device id", () => {
    const first = createCollaboratorIdentity(firstDevice);
    const second = createCollaboratorIdentity(firstDevice);

    expect(first).toEqual(second);
    expect(first.userName).toBe("Device 1111");
    expect(first.shortDeviceId).toBe("1111");
    expect(first.userName).not.toContain(firstDevice);
    expect(first.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("distinguishes independent devices without personal data", () => {
    const first = createCollaboratorIdentity(firstDevice);
    const second = createCollaboratorIdentity(secondDevice);

    expect(first.userName).not.toBe(second.userName);
    expect(first.shortDeviceId).not.toBe(second.shortDeviceId);
  });

  it("keeps one device id while distinguishing live tab sessions", () => {
    const first = createSessionDiagnostics({
      deviceId: firstDevice,
      tabId: "tab-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    });
    const second = createSessionDiagnostics({
      deviceId: firstDevice,
      tabId: "tab-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    });

    expect(first.deviceLabel).toBe("Device 1111");
    expect(second.deviceLabel).toBe("Device 1111");
    expect(first.sessionLabel).toBe("Tab AAAA");
    expect(second.sessionLabel).toBe("Tab BBBB");
    expect(first.sessionLabel).not.toBe(second.sessionLabel);
  });
});
