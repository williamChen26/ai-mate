import { describe, expect, it } from "vitest";

import { createCollaborationStatusView } from "../collaboration-status";

describe("collaboration status", () => {
  it("maps loading to the only non-error pending state", () => {
    expect(
      createCollaborationStatusView({ storeStatus: "loading" })
    ).toMatchObject({
      label: "Connecting sync",
      state: "connecting",
      raw: {
        storeStatus: "loading",
        connectionStatus: null
      }
    });
  });

  it("maps online remote sync to the only ready canvas state", () => {
    expect(
      createCollaborationStatusView({
        storeStatus: "synced-remote",
        connectionStatus: "online"
      })
    ).toMatchObject({
      label: "Backend sync",
      state: "online",
      raw: {
        storeStatus: "synced-remote",
        connectionStatus: "online"
      }
    });
  });

  it("maps offline remote sync to a raw error", () => {
    const view = createCollaborationStatusView({
      storeStatus: "synced-remote",
      connectionStatus: "offline"
    });

    expect(view).toMatchObject({
      label: "Sync raw error",
      state: "error",
      raw: {
        storeStatus: "synced-remote",
        connectionStatus: "offline"
      }
    });
  });

  it("maps local cache and not-synced states to raw errors", () => {
    expect(
      createCollaborationStatusView({ storeStatus: "synced-local" })
    ).toMatchObject({
      label: "Sync raw error",
      state: "error",
      raw: { storeStatus: "synced-local" }
    });
    expect(
      createCollaborationStatusView({ storeStatus: "not-synced" })
    ).toMatchObject({
      label: "Sync raw error",
      state: "error",
      raw: { storeStatus: "not-synced" }
    });
  });

  it("maps sync and configuration errors to raw error states", () => {
    expect(
      createCollaborationStatusView({
        storeStatus: "error",
        errorMessage: "WebSocket closed"
      })
    ).toMatchObject({
      label: "Sync raw error",
      state: "error",
      detail: "WebSocket closed",
      raw: {
        storeStatus: "error",
        errorMessage: "WebSocket closed"
      }
    });

    expect(
      createCollaborationStatusView({
        storeStatus: "configuration-error",
        errorMessage: "Sync server URL must be configured explicitly."
      })
    ).toMatchObject({
      label: "Sync raw error",
      state: "error",
      raw: {
        storeStatus: "configuration-error",
        errorMessage: "Sync server URL must be configured explicitly."
      }
    });
  });
});
