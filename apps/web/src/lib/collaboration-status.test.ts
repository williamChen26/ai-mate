import { describe, expect, it } from "vitest";

import { createCollaborationStatusView } from "./collaboration-status";

describe("collaboration status", () => {
  it("maps remote loading before timeout to a compact connecting state", () => {
    expect(
      createCollaborationStatusView({ storeStatus: "loading" })
    ).toMatchObject({
      label: "Connecting sync",
      state: "connecting",
      recoverable: true
    });
  });

  it("maps long loading to a visible backend unavailable state", () => {
    const view = createCollaborationStatusView({
      storeStatus: "loading",
      timedOut: true
    });

    expect(view).toMatchObject({
      label: "Backend unavailable",
      state: "offline",
      recoverable: true
    });
    expect(view.detail).toContain("process-local");
  });

  it("maps online remote sync to the ready state", () => {
    expect(
      createCollaborationStatusView({
        storeStatus: "synced-remote",
        connectionStatus: "online"
      })
    ).toMatchObject({
      label: "Backend sync",
      state: "online",
      recoverable: false
    });
  });

  it("maps offline remote sync to a reconnecting state", () => {
    const view = createCollaborationStatusView({
      storeStatus: "synced-remote",
      connectionStatus: "offline"
    });

    expect(view).toMatchObject({
      label: "Sync reconnecting",
      state: "offline",
      recoverable: true
    });
    expect(view.detail).toContain("in-memory room may reset");
  });

  it("maps local cache and not-synced states without pretending they are online", () => {
    expect(
      createCollaborationStatusView({ storeStatus: "synced-local" })
    ).toMatchObject({
      label: "Local sync cache",
      state: "local"
    });
    expect(
      createCollaborationStatusView({ storeStatus: "not-synced" })
    ).toMatchObject({
      label: "Sync not connected",
      state: "offline"
    });
  });

  it("maps sync and configuration errors to recoverable error states", () => {
    expect(
      createCollaborationStatusView({
        storeStatus: "error",
        errorMessage: "WebSocket closed"
      })
    ).toMatchObject({
      label: "Sync error",
      state: "error",
      detail: "WebSocket closed",
      recoverable: true
    });

    expect(
      createCollaborationStatusView({
        storeStatus: "configuration-error",
        errorMessage: "Sync server URL must be configured explicitly."
      })
    ).toMatchObject({
      label: "Sync configuration error",
      state: "error",
      recoverable: true
    });
  });
});
