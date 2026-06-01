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
  | "offline"
  | "local"
  | "error";

export type CollaborationStatusInput = {
  storeStatus: CollaborationStoreStatus;
  connectionStatus?: CollaborationConnectionStatus | undefined;
  timedOut?: boolean;
  errorMessage?: string | undefined;
};

export type CollaborationStatusView = {
  label: string;
  state: CollaborationStatusState;
  detail: string;
  recoverable: boolean;
};

const PROCESS_LOCAL_RESET_NOTE =
  "The backend uses process-local memory; the in-memory room may reset after a server restart.";

export function createCollaborationStatusView(
  input: CollaborationStatusInput
): CollaborationStatusView {
  switch (input.storeStatus) {
    case "loading":
      return input.timedOut
        ? {
            label: "Backend unavailable",
            state: "offline",
            detail: `Still waiting for the configured sync backend. ${PROCESS_LOCAL_RESET_NOTE}`,
            recoverable: true
          }
        : {
            label: "Connecting sync",
            state: "connecting",
            detail: "Opening the route-backed tldraw sync room.",
            recoverable: true
          };
    case "synced-remote":
      return input.connectionStatus === "online"
        ? {
            label: "Backend sync",
            state: "online",
            detail: "Connected to the dedicated tldraw sync backend.",
            recoverable: false
          }
        : {
            label: "Sync reconnecting",
            state: "offline",
            detail: `The backend connection is offline; reconnecting to the same room route. ${PROCESS_LOCAL_RESET_NOTE}`,
            recoverable: true
          };
    case "synced-local":
      return {
        label: "Local sync cache",
        state: "local",
        detail: `Using local tldraw cache while remote sync is not active. ${PROCESS_LOCAL_RESET_NOTE}`,
        recoverable: true
      };
    case "not-synced":
      return {
        label: "Sync not connected",
        state: "offline",
        detail: "The canvas is not connected to a remote sync room.",
        recoverable: true
      };
    case "configuration-error":
      return {
        label: "Sync configuration error",
        state: "error",
        detail:
          input.errorMessage ??
          "The sync backend URL or room configuration is invalid.",
        recoverable: true
      };
    case "error":
      return {
        label: "Sync error",
        state: "error",
        detail:
          input.errorMessage ??
          `The tldraw sync client reported an error. ${PROCESS_LOCAL_RESET_NOTE}`,
        recoverable: true
      };
  }
}
