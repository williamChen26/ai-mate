export type CollaborationStoreStatus =
  | "loading"
  | "synced-remote"
  | "synced-local"
  | "not-synced"
  | "error"
  | "configuration-error";

export type CollaborationConnectionStatus = "online" | "offline";

export type CollaborationStatusState =
  | "connecting"
  | "online"
  | "error";

export type CollaborationStatusInput = {
  storeStatus: CollaborationStoreStatus;
  connectionStatus?: CollaborationConnectionStatus | undefined;
  errorMessage?: string | undefined;
};

export type CollaborationStatusView = {
  label: string;
  state: CollaborationStatusState;
  detail: string;
  raw: unknown;
};

export function createCollaborationStatusView(
  input: CollaborationStatusInput
): CollaborationStatusView {
  switch (input.storeStatus) {
    case "loading":
      return {
        label: "Connecting sync",
        state: "connecting",
        detail: "Opening the collaborative tldraw room.",
        raw: {
          storeStatus: input.storeStatus,
          connectionStatus: input.connectionStatus ?? null
        }
      };
    case "synced-remote":
      return input.connectionStatus === "online"
        ? {
            label: "Backend sync",
            state: "online",
            detail: "Connected to the dedicated tldraw sync backend.",
            raw: {
              storeStatus: input.storeStatus,
              connectionStatus: input.connectionStatus
            }
          }
        : {
            label: "Sync raw error",
            state: "error",
            detail: "Collaborative backend connection is not online.",
            raw: {
              storeStatus: input.storeStatus,
              connectionStatus: input.connectionStatus ?? null,
              errorMessage: input.errorMessage ?? null
            }
          };
    case "synced-local":
    case "not-synced":
    case "configuration-error":
    case "error":
      return {
        label: "Sync raw error",
        state: "error",
        detail:
          input.errorMessage ??
          "Collaborative canvas is unavailable because sync state is invalid.",
        raw: {
          storeStatus: input.storeStatus,
          connectionStatus: input.connectionStatus ?? null,
          errorMessage: input.errorMessage ?? null
        }
      };
  }
}
