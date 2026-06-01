const COLLABORATOR_COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#7c3aed",
  "#be123c",
  "#0f766e",
  "#a16207"
];

export type CollaboratorIdentity = {
  deviceId: string;
  shortDeviceId: string;
  userName: string;
  color: string;
};

export type SessionDiagnostics = {
  deviceId: string;
  tabId: string;
  deviceLabel: string;
  sessionLabel: string;
};

export function createCollaboratorIdentity(
  deviceId: string
): CollaboratorIdentity {
  const shortDeviceId = getShortOpaqueSuffix(deviceId);
  const color =
    COLLABORATOR_COLORS[hashString(deviceId) % COLLABORATOR_COLORS.length] ??
    "#2563eb";

  return {
    deviceId,
    shortDeviceId,
    userName: `Device ${shortDeviceId}`,
    color
  };
}

export function createSessionDiagnostics(input: {
  deviceId: string;
  tabId: string;
}): SessionDiagnostics {
  const identity = createCollaboratorIdentity(input.deviceId);

  return {
    deviceId: input.deviceId,
    tabId: input.tabId,
    deviceLabel: identity.userName,
    sessionLabel: `Tab ${getShortOpaqueSuffix(input.tabId)}`
  };
}

function getShortOpaqueSuffix(value: string) {
  const normalized = value.replace(/[^a-zA-Z0-9]/g, "");
  return normalized.slice(-4).toUpperCase();
}

function hashString(value: string) {
  return [...value].reduce(
    (hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0,
    0
  );
}
