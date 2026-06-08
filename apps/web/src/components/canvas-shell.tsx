"use client";

/**
 * CanvasShell 是 MVP 的客户端组合根。它采用端口与适配器形态：
 * tldraw 拥有实时编辑器，库模块拥有协同配置和身份逻辑，
 * 这个组件负责把它们接成简洁的用户工作区。
 */
import {
  useEffect,
  useMemo,
  useRef,
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
  AGENT_OUTPUT_SCHEMA_VERSION,
  type CompletionProposalOutput
} from "@production-spec-graph/shared";

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
import {
  acceptAiDropProposal,
  activateAiDropProposal,
  clearAiDropProposal,
  createAiDropDiagnostics,
  refreshAiDropProposalState,
  type AiDropDiagnostics,
  type AiDropProposalState,
  type AiDropRuntimeContext
} from "@/lib/ai-drop-proposal";
import { applyAiDropProposalToEditor } from "@/lib/ai-drop-canvas-boundary";
import {
  classifyConversationGatewayResponse,
  createConversationGatewayState,
  getConversationOutputText,
  type ConversationGatewayState
} from "@/lib/conversation-gateway";

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
  const [editor, setEditor] = useState<Editor | null>(null);
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
          onMount={(mountedEditor) => {
            setEditor(mountedEditor);
            return registerMountedRoomContext(mountedEditor, collaboration);
          }}
        />
        {editor ? <AiDropRuntime editor={editor} /> : null}
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
  const [conversation, setConversation] = useState<ConversationGatewayState>(
    createConversationGatewayState("idle")
  );
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
      setConversation(createConversationGatewayState("empty-message"));
      return;
    }

    setStatus("sending");
    setConversation(createConversationGatewayState("pending"));
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
      setConversation(createConversationGatewayState("error", result.error));
      return;
    }

    setStatus("ready");
    setRawResult(result.value);
    setConversation(classifyConversationGatewayResponse(result.value));
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
      <ConversationGatewayResult state={conversation} />
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
 * 最小 conversation surface。它只展示 direct answer/state 和少量元数据，raw
 * 结构仍然保留在下方 pre 中，避免这期滑向聊天 UI 设计。
 */
function ConversationGatewayResult({
  state
}: {
  state: ConversationGatewayState;
}) {
  if (state.status === "idle") {
    return null;
  }

  const text = getConversationOutputText(state);

  return (
    <section
      className="canvas-shell__conversation-result"
      data-testid="conversation-result"
      data-state={state.status}
      aria-live="polite"
    >
      <div className="canvas-shell__mate-row">
        <strong>Conversation</strong>
        <span data-testid="conversation-state">{state.status}</span>
      </div>
      {text ? <p data-testid="conversation-text">{text}</p> : null}
      <dl className="canvas-shell__conversation-meta">
        {state.outputKind ? (
          <>
            <dt>Output</dt>
            <dd data-testid="conversation-output-kind">{state.outputKind}</dd>
          </>
        ) : null}
        {state.triggerKind ? (
          <>
            <dt>Trigger</dt>
            <dd data-testid="conversation-trigger-kind">{state.triggerKind}</dd>
          </>
        ) : null}
        {state.freshnessState ? (
          <>
            <dt>Freshness</dt>
            <dd data-testid="conversation-freshness">{state.freshnessState}</dd>
          </>
        ) : null}
        {state.readinessState ? (
          <>
            <dt>Readiness</dt>
            <dd data-testid="conversation-readiness">{state.readinessState}</dd>
          </>
        ) : null}
      </dl>
    </section>
  );
}

/**
 * AI Drop 的最小浏览器运行时。它负责把 completion-proposal 变成透明预览，并把
 * Tab 接受动作收束到受控 tldraw apply boundary。
 */
function AiDropRuntime({ editor }: { editor: Editor }) {
  const [proposalState, setProposalState] = useState<AiDropProposalState>(
    clearAiDropProposal("initial")
  );
  const proposalStateRef = useRef(proposalState);

  useEffect(() => {
    proposalStateRef.current = proposalState;
  }, [proposalState]);

  const readContext = (): AiDropRuntimeContext | null => {
    const snapshot = window.__PSG_ROOM_CONTEXT__?.extractSnapshot();
    if (!snapshot) {
      return null;
    }
    return {
      snapshot,
      freshness: {
        snapshotVersion: snapshot.freshness.snapshotVersion,
        eventVersion: snapshot.freshness.eventVersionAtSnapshot,
        changedSinceSnapshot: false,
        stale: false
      }
    };
  };

  const activate = (output: unknown) => {
    const context = readContext();
    const next = context
      ? activateAiDropProposal(output, context)
      : ({ status: "refused", reason: "missing-runtime-context" } as const);
    setProposalState(next);
    return next;
  };

  const accept = async () => {
    const context = readContext();
    if (!context) {
      const next = { status: "refused", reason: "missing-runtime-context" } as const;
      setProposalState(next);
      return next;
    }

    const next = await acceptAiDropProposal(
      proposalStateRef.current,
      context,
      (active) => applyAiDropProposalToEditor(editor, active)
    );
    setProposalState(next);

    if (next.status === "applied") {
      await window.__PSG_ROOM_CONTEXT__?.emitCanvasChange({
        affectedShapeIds: next.appliedShapeIds,
        summary: "ai-drop accepted proposal"
      });
      await window.__PSG_ROOM_CONTEXT__?.publishSnapshot();
    }

    return next;
  };

  useEffect(() => {
    const api: AiDropRuntimeApi = {
      activate,
      activateTextCompletion(input = {}) {
        const context = readContext();
        const output = context
          ? createDeterministicAiDropOutput(context, "text-in-element", input.text)
          : null;
        return output
          ? activate(output)
          : setAndReturn(setProposalState, {
              status: "refused",
              reason: "missing-runtime-context"
            });
      },
      activateFlowContinuation(input = {}) {
        const context = readContext();
        const output = context
          ? createDeterministicAiDropOutput(
              context,
              "flow-continuation",
              input.text
            )
          : null;
        return output
          ? activate(output)
          : setAndReturn(setProposalState, {
              status: "refused",
              reason: "missing-runtime-context"
            });
      },
      accept,
      cancel(reason = "cancelled") {
        return setAndReturn(setProposalState, clearAiDropProposal(reason));
      },
      getState() {
        return proposalStateRef.current;
      },
      getDiagnostics() {
        return createAiDropDiagnostics(proposalStateRef.current);
      }
    };

    window.__PSG_AI_DROP__ = api;
    return () => {
      if (window.__PSG_AI_DROP__ === api) {
        delete window.__PSG_AI_DROP__;
      }
    };
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreAiDropKeyEvent(event)) {
        return;
      }
      if (event.key === "Escape" && proposalStateRef.current.status === "active") {
        event.preventDefault();
        setProposalState(clearAiDropProposal("escape"));
      }
      if (event.key === "Tab" && proposalStateRef.current.status === "active") {
        event.preventDefault();
        void accept();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    if (proposalState.status !== "active") {
      return;
    }

    const timer = window.setInterval(() => {
      const context = readContext();
      if (!context) {
        return;
      }
      const refreshed = refreshAiDropProposalState(
        proposalStateRef.current,
        context
      );
      if (refreshed.status !== "active") {
        setProposalState(refreshed);
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [proposalState.status]);

  if (proposalState.status !== "active") {
    return null;
  }

  return <AiDropPreviewOverlay editor={editor} state={proposalState} />;
}

/**
 * 渲染候选预览。它只是 DOM overlay，不创建 tldraw shape，所以 Tab 前不会污染
 * 协同文档或被其他协作者当成真实画布状态。
 */
function AiDropPreviewOverlay({
  editor,
  state
}: {
  editor: Editor;
  state: Extract<AiDropProposalState, { status: "active" }>;
}) {
  const preview = state.preview;
  const point = editor.pageToScreen({ x: preview.bounds.x, y: preview.bounds.y });
  const zoom = editor.getZoomLevel?.() ?? 1;

  return (
    <div
      className="canvas-shell__ai-drop-preview"
      data-testid="ai-drop-preview"
      data-kind={preview.kind}
      style={{
        left: Math.max(12, point.x),
        top: Math.max(12, point.y),
        width: Math.max(160, preview.bounds.w * zoom),
        minHeight: Math.max(44, preview.bounds.h * zoom)
      }}
    >
      {preview.kind === "flow-continuation"
        ? preview.nodes.map((node) => node.text).join(" -> ")
        : preview.text}
    </div>
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
 * 这期的窄激活入口：用当前 selection 生成 deterministic completion-proposal。
 * 它只服务本地验证和 E2E，不新增 AI 输出协议，也不代表真正 LLM provider。
 */
function createDeterministicAiDropOutput(
  context: AiDropRuntimeContext,
  variant: "text-in-element" | "flow-continuation",
  text?: string
): CompletionProposalOutput | null {
  const targetId = context.snapshot.selection.selectedShapeIds[0];
  const targetShape = context.snapshot.document.shapes.find(
    (shape) => shape.id === targetId
  );

  if (!targetId || !targetShape || !context.freshness) {
    return null;
  }

  const now = new Date().toISOString();
  const base = {
    schemaVersion:
      AGENT_OUTPUT_SCHEMA_VERSION as CompletionProposalOutput["schemaVersion"],
    outputId: `ai-drop-output:${now}`,
    roomId: context.snapshot.roomId,
    createdAt: now,
    basedOn: context.freshness,
    nonMutating: true as const,
    kind: "completion-proposal" as const
  };

  if (variant === "flow-continuation") {
    return {
      ...base,
      proposal: {
        proposalId: `ai-drop-proposal:${now}`,
        status: "pending",
        previewOnly: true,
        requiresAcceptance: true,
        applied: false,
        completion: {
          kind: "flow-continuation",
          anchorShapeId: targetId,
          proposedNodes: [
            { text: text?.trim() || "Continue with the next validation step" }
          ],
          proposedConnectors: [
            { fromShapeId: targetId, toProposedNodeIndex: 0 }
          ]
        },
        rationale: "Deterministic local AI Drop fixture for selected flow context."
      }
    };
  }

  return {
    ...base,
    proposal: {
      proposalId: `ai-drop-proposal:${now}`,
      status: "pending",
      previewOnly: true,
      requiresAcceptance: true,
      applied: false,
      completion: {
        kind: "text-in-element",
        shapeId: targetId,
        currentText: targetShape.text ?? "",
        proposedText:
          text?.trim() ||
          `${targetShape.text ?? ""} What outcome should this step produce?`.trim()
      },
      rationale: "Deterministic local AI Drop fixture for selected text context."
    }
  };
}

function shouldIgnoreAiDropKeyEvent(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  return Boolean(
    target?.closest("textarea,input,select") || target?.isContentEditable
  );
}

function setAndReturn<T extends AiDropProposalState>(
  setState: (state: T) => void,
  state: T
): T {
  setState(state);
  return state;
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

type AiDropRuntimeApi = {
  activate: (output: unknown) => AiDropProposalState;
  activateTextCompletion: (input?: { text?: string }) => AiDropProposalState;
  activateFlowContinuation: (input?: { text?: string }) => AiDropProposalState;
  accept: () => Promise<AiDropProposalState>;
  cancel: (reason?: string) => AiDropProposalState;
  getState: () => AiDropProposalState;
  getDiagnostics: () => AiDropDiagnostics;
};

declare global {
  interface Window {
    __PSG_AI_DROP__?: AiDropRuntimeApi;
  }
}
