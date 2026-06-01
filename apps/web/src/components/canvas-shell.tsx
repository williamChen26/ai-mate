"use client";

/**
 * CanvasShell 是 MVP 的客户端组合根。它采用端口与适配器形态：
 * tldraw 拥有实时编辑器，库模块拥有协同配置和身份逻辑，
 * 这个组件负责把它们接成简洁的用户工作区。
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSync } from "@tldraw/sync";
import {
  computed,
  createUserId,
  inlineBase64AssetStore,
  Tldraw,
  UserRecordType,
  type TLStoreWithStatus,
  type TLUserStore
} from "tldraw";

import {
  createTabSessionId,
  getOrCreateDeviceIdentity
} from "@/lib/device-identity";
import {
  resolveSyncConfig,
  type SyncConfigError
} from "@/lib/sync-config";
import {
  createCollaborationStatusView,
  type CollaborationStatusView
} from "@/lib/collaboration-status";
import {
  createCollaboratorIdentity,
  createSessionDiagnostics
} from "@/lib/collaborator-identity";
import { buildRoomShareUrl } from "@/lib/room-share";

type CollaborationState =
  | {
      ok: true;
      deviceId: string;
      persistedDeviceId: boolean;
      roomId: string;
      roomUri: string;
      tabId: string;
      sessionId: string;
      deviceName: string;
      deviceColor: string;
      sessionLabel: string;
      users: TLUserStore;
    }
  | {
      ok: false;
      deviceId: string;
      persistedDeviceId: boolean;
      error: SyncConfigError;
    };

/**
 * 渲染全屏 tldraw 工作区。AI/智能协作者后续应从服务端协同层接入 room，
 * 前端只负责用户编辑、路由身份和可见状态。
 */
export function CanvasShell({ roomId }: { roomId: string }) {
  const isClientReady = useClientReady();
  const collaboration = useMemo(
    () => (isClientReady ? createCollaborationState(roomId) : null),
    [isClientReady, roomId]
  );

  if (!collaboration) {
    return (
      <CanvasShellFrame
        statusView={createCollaborationStatusView({
          storeStatus: "loading"
        })}
      >
        <div className="canvas-shell__workspace--message">
          <div className="canvas-shell__error" role="status">
            <strong>Preparing collaboration.</strong>
            <span>Opening the route-backed tldraw sync room.</span>
          </div>
        </div>
      </CanvasShellFrame>
    );
  }

  if (!collaboration.ok) {
    const statusView = createCollaborationStatusView({
      storeStatus: "configuration-error",
      errorMessage: collaboration.error.message
    });

    return (
      <CanvasShellFrame
        statusView={statusView}
      >
        <div className="canvas-shell__error" role="alert">
          <strong>Collaboration is not connected.</strong>
          <span>{collaboration.error.message}</span>
        </div>
      </CanvasShellFrame>
    );
  }

  return (
    <SyncedCanvasShell collaboration={collaboration} />
  );
}

function SyncedCanvasShell({
  collaboration
}: {
  collaboration: Extract<CollaborationState, { ok: true }>;
}) {
  const store = useSync({
    uri: collaboration.roomUri,
    assets: inlineBase64AssetStore,
    users: collaboration.users
  });
  const loadingTimedOut = useLoadingTimeout(store.status === "loading");
  const statusView = createCollaborationStatusView({
    storeStatus: store.status,
    connectionStatus:
      store.status === "synced-remote" ? store.connectionStatus : undefined,
    timedOut: loadingTimedOut,
    errorMessage: store.status === "error" ? store.error.message : undefined
  });
  const share = useRoomShare(collaboration.roomId);

  return (
    <CanvasShellFrame
      statusView={statusView}
      identity={{
        color: collaboration.deviceColor,
        deviceLabel: collaboration.deviceName,
        sessionLabel: collaboration.sessionLabel
      }}
      share={share}
    >
      <div className="canvas-shell__editor" data-testid="tldraw-host">
        <Tldraw store={store} />
      </div>
    </CanvasShellFrame>
  );
}

function CanvasShellFrame({
  children,
  statusView,
  identity,
  share
}: {
  children: ReactNode;
  statusView: CollaborationStatusView;
  identity?: {
    color: string;
    deviceLabel: string;
    sessionLabel: string;
  };
  share?: RoomShareState;
}) {
  return (
    <main className="canvas-shell" data-testid="canvas-shell">
      <header className="canvas-shell__bar" aria-label="Canvas workspace">
        <div className="canvas-shell__brand">
          <div className="canvas-shell__mark" aria-hidden="true">
            PS
          </div>
          <div className="canvas-shell__title">
            <strong>Production Spec Graph</strong>
            <span>AI coworker canvas</span>
          </div>
        </div>
        <div className="canvas-shell__toolbar" aria-label="Canvas status">
          <span className="canvas-shell__pill">Source tldraw</span>
          <span
            className="canvas-shell__pill"
            data-testid="sync-status"
            data-state={statusView.state}
            title={statusView.detail}
          >
            {statusView.label}
          </span>
          {identity ? (
            <span
              className="canvas-shell__identity"
              data-testid="collab-identity"
              title={identity.sessionLabel}
            >
              <span
                className="canvas-shell__identity-dot"
                aria-hidden="true"
                style={{ backgroundColor: identity.color }}
              />
              <span>{identity.deviceLabel}</span>
            </span>
          ) : null}
          {share ? (
            <button
              className="canvas-shell__share"
              data-testid="share-room-button"
              data-share-url={share.url ?? ""}
              type="button"
              onClick={share.copy}
              disabled={!share.url}
            >
              {share.label}
            </button>
          ) : null}
        </div>
      </header>
      <section className="canvas-shell__workspace" aria-label="Infinite canvas">
        {children}
      </section>
    </main>
  );
}

function createCollaborationState(roomId: string): CollaborationState {
  const identity = getOrCreateDeviceIdentity();
  const tabId = createTabSessionId();
  const collaborator = createCollaboratorIdentity(identity.deviceId);
  const session = createSessionDiagnostics({
    deviceId: identity.deviceId,
    tabId
  });
  const syncConfig = resolveSyncConfig({
    serverUrl: process.env.NEXT_PUBLIC_PSG_SYNC_SERVER_URL,
    roomId,
    deviceId: identity.deviceId,
    tabId
  });

  if (!syncConfig.ok) {
    return {
      ok: false,
      deviceId: identity.deviceId,
      persistedDeviceId: identity.persisted,
      error: syncConfig.error
    };
  }

  return {
    ok: true,
    deviceId: identity.deviceId,
    persistedDeviceId: identity.persisted,
    roomId: syncConfig.value.roomId,
    roomUri: syncConfig.value.roomUri,
    tabId,
    sessionId: syncConfig.value.sessionId,
    deviceName: collaborator.userName,
    deviceColor: collaborator.color,
    sessionLabel: session.sessionLabel,
    users: createDeviceUserStore(identity.deviceId)
  };
}

function createDeviceUserStore(deviceId: string): TLUserStore {
  const collaborator = createCollaboratorIdentity(deviceId);
  const currentUser = computed(`psg-current-user:${deviceId}`, () =>
    UserRecordType.create({
      id: createUserId(deviceId),
      name: collaborator.userName,
      color: collaborator.color,
      imageUrl: "",
      meta: { deviceId, shortDeviceId: collaborator.shortDeviceId }
    })
  );

  return {
    currentUser,
    resolve(userId) {
      return computed(`psg-user:${userId}`, () =>
        userId === createUserId(deviceId) ? currentUser.get() : null
      );
    }
  };
}

type RoomShareState = {
  url: string | null;
  label: string;
  copy: () => Promise<void>;
};

function useRoomShare(roomId: string): RoomShareState {
  const [url, setUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"idle" | "copied" | "ready">(
    "idle"
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const result = buildRoomShareUrl({
      origin: window.location.origin,
      roomId
    });
    setUrl(result.ok ? result.value : null);
    setFeedback("idle");
  }, [roomId]);

  useEffect(() => {
    if (feedback === "idle") {
      return;
    }

    const timeout = window.setTimeout(() => setFeedback("idle"), 1800);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  return {
    url,
    label:
      feedback === "copied"
        ? "Copied"
        : feedback === "ready"
          ? "Link ready"
          : "Copy link",
    async copy() {
      if (!url) {
        return;
      }

      try {
        await navigator.clipboard?.writeText(url);
        setFeedback("copied");
      } catch {
        setFeedback("ready");
      }
    }
  };
}

function useLoadingTimeout(isLoading: boolean, timeoutMs = 1800) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setTimedOut(false);
      return;
    }

    const timeout = window.setTimeout(() => setTimedOut(true), timeoutMs);
    return () => window.clearTimeout(timeout);
  }, [isLoading, timeoutMs]);

  return timedOut;
}

function useClientReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  return ready;
}
