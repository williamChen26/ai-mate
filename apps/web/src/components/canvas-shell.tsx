"use client";

/**
 * CanvasShell 是 MVP 的客户端组合根。它采用端口与适配器形态：
 * tldraw 拥有实时编辑器，库模块拥有协同配置和身份逻辑，
 * 这个组件负责把它们接成简洁的用户工作区。
 */
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import { useSync } from "@tldraw/sync";
import {
  computed,
  createUserId,
  inlineBase64AssetStore,
  Tldraw,
  UserRecordType,
  type Editor,
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
import {
  createContextBaseUrlFromRoomUri,
  registerRoomContextRuntime
} from "@/lib/room-context";
import { createRoomMateClient } from "@/lib/mate-client";
import { createRoomDiagnosticsClient } from "@/lib/room-diagnostics-client";

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
        <RawWorkspaceMessage
          title="Preparing collaborative canvas"
          value={{ state: "hydrating-client" }}
        />
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
        <RawWorkspaceMessage
          role="alert"
          title={collaboration.error.message}
          value={collaboration.error}
        />
      </CanvasShellFrame>
    );
  }

  return (
    <SyncedCanvasShell collaboration={collaboration} />
  );
}

/**
 * 为已校验的 room 挂载远程 tldraw store，并把 raw Mate 面板放在编辑器旁边。
 */
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
  const statusView = createCollaborationStatusView({
    storeStatus: store.status,
    connectionStatus:
      store.status === "synced-remote" ? store.connectionStatus : undefined,
    errorMessage: store.status === "error" ? store.error.message : undefined
  });
  const share = useRoomShare(collaboration.roomId);

  if (statusView.state === "connecting") {
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
        <RawWorkspaceMessage
          title="Connecting collaborative canvas"
          value={statusView.raw}
        />
      </CanvasShellFrame>
    );
  }

  if (statusView.state === "error") {
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
        <RawWorkspaceMessage
          role="alert"
          title={statusView.detail}
          value={statusView.raw}
        />
      </CanvasShellFrame>
    );
  }

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
        <Tldraw
          store={store}
          onMount={(editor) => registerMountedRoomContext(editor, collaboration)}
        />
      </div>
      <MateRawPanel collaboration={collaboration} />
    </CanvasShellFrame>
  );
}

/**
 * 最小 raw AI 面板，用来先验证产品逻辑链路，而不是先做精致聊天 UI。
 *
 * 发送时会先发布最新画布 snapshot，再记录 chat-boundary event，然后把用户消息
 * 发给 server 并渲染 mate 的原始响应。Diagnostics 按钮只读取同一个 room 的
 * server diagnostics，不会修改画布。
 */
function MateRawPanel({
  collaboration
}: {
  collaboration: Extract<CollaborationState, { ok: true }>;
}) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ready" | "error">(
    "idle"
  );
  const [rawResult, setRawResult] = useState<unknown>(null);
  const [rawDiagnostics, setRawDiagnostics] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const client = useMemo(
    () =>
      createRoomMateClient({
        baseUrl: createContextBaseUrlFromRoomUri(collaboration.roomUri),
        roomId: collaboration.roomId,
        source: {
          deviceId: collaboration.deviceId,
          sessionId: collaboration.sessionId,
          tabId: collaboration.tabId
        }
      }),
    [collaboration]
  );
  const diagnosticsClient = useMemo(
    () =>
      createRoomDiagnosticsClient({
        baseUrl: createContextBaseUrlFromRoomUri(collaboration.roomUri),
        roomId: collaboration.roomId
      }),
    [collaboration]
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) {
      setStatus("error");
      setError("Message is required.");
      return;
    }

    setStatus("sending");
    setError(null);
    setRawResult(null);
    // 发送 mate 消息前主动刷新一次 AI 可读 snapshot。紧接着写入 chat-boundary
    // event，所以 server freshness 会把这次聊天边界计为 snapshot 后的新事件。
    await window.__PSG_ROOM_CONTEXT__?.publishSnapshot();
    await window.__PSG_ROOM_CONTEXT__?.emitChatBoundary(trimmed);
    const result = await client.sendMessage(trimmed);

    if (!result.ok) {
      setStatus("error");
      setError(result.error);
      return;
    }

    setStatus("ready");
    setRawResult(result.value);
  }

  async function fetchDiagnostics() {
    setStatus("sending");
    setError(null);
    const result = await diagnosticsClient.fetchDiagnostics();

    if (!result.ok) {
      setStatus("error");
      setError(result.error);
      return;
    }

    setStatus("ready");
    setRawDiagnostics(result.value);
  }

  return (
    <aside className="canvas-shell__mate-panel" aria-label="Mate raw data">
      <form className="canvas-shell__mate-form" onSubmit={submit}>
        <div className="canvas-shell__mate-row">
          <strong>Mate raw</strong>
          <span data-testid="mate-status">
            {status === "idle"
              ? "Idle"
              : status === "sending"
                ? "Sending"
                : status === "ready"
                  ? "Ready"
                  : "Error"}
          </span>
        </div>
        <textarea
          data-testid="mate-message-input"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={2}
          placeholder="Message"
        />
        <button
          data-testid="mate-send-button"
          type="submit"
          disabled={status === "sending"}
        >
          Send
        </button>
      </form>
      <button
        data-testid="mate-diagnostics-button"
        type="button"
        disabled={status === "sending"}
        onClick={fetchDiagnostics}
      >
        Diagnostics
      </button>
      {error ? (
        <pre className="canvas-shell__mate-error" data-testid="mate-error">
          {error}
        </pre>
      ) : null}
      {rawResult ? (
        <pre className="canvas-shell__mate-raw" data-testid="mate-raw-result">
          {JSON.stringify(rawResult, null, 2)}
        </pre>
      ) : null}
      {rawDiagnostics ? (
        <pre
          className="canvas-shell__mate-raw"
          data-testid="mate-diagnostics-raw"
        >
          {JSON.stringify(rawDiagnostics, null, 2)}
        </pre>
      ) : null}
    </aside>
  );
}

/**
 * 把已挂载的 tldraw editor 接入 room context runtime，让浏览器可以提取并发布
 * AI 可消费的画布上下文。
 */
function registerMountedRoomContext(
  editor: Editor,
  collaboration: Extract<CollaborationState, { ok: true }>
) {
  return registerRoomContextRuntime(editor, {
    baseUrl: createContextBaseUrlFromRoomUri(collaboration.roomUri),
    roomId: collaboration.roomId,
    source: {
      deviceId: collaboration.deviceId,
      sessionId: collaboration.sessionId,
      tabId: collaboration.tabId
    }
  });
}

/**
 * 画布工作区的共享外框，承载状态、身份、分享入口和主体内容。
 */
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

/**
 * 生成一个 room 路由需要的浏览器侧协同状态：持久 device 身份、tab session、
 * sync URI、tldraw user store 和展示标签。
 */
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

/**
 * 为当前浏览器 device 创建 tldraw 用户 store。
 */
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

/**
 * 生成并复制当前 room 分享 URL，同时提供短暂按钮反馈。
 */
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

/**
 * 在工作区中以 raw JSON 形式展示连接或异常信息。
 */
function RawWorkspaceMessage({
  title,
  value,
  role = "status"
}: {
  title: string;
  value: unknown;
  role?: "status" | "alert";
}) {
  return (
    <div className="canvas-shell__workspace--message">
      <div className="canvas-shell__error" role={role}>
        <strong>{title}</strong>
        <pre className="canvas-shell__mate-raw">
          {JSON.stringify(value, null, 2)}
        </pre>
      </div>
    </div>
  );
}

/**
 * 等到 hydration 后再执行客户端专属协同初始化。
 */
function useClientReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  return ready;
}
