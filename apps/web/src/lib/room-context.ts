import {
  CANVAS_CONTEXT_SCHEMA_VERSION,
  canvasSnapshotSchema,
  createCanvasChangeEvent,
  createChatBoundaryEvent,
  createSelectionChangeEvent,
  createViewportChangeEvent,
  roomOperationEventSchema,
  type CanvasSnapshot,
  type RoomContextFeed,
  type RoomContextSource,
  type RoomOperationEvent
} from "@production-spec-graph/shared";

type BoundsLike = {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  width?: number;
  height?: number;
  toJson?: () => unknown;
};

type ShapeLike = {
  id: string;
  type: string;
  props?: unknown;
};

type StoreHistoryEntryLike = {
  changes?: {
    added?: Record<string, unknown>;
    updated?: Record<string, [unknown, unknown]>;
    removed?: Record<string, unknown>;
  };
};

type StoreListenFiltersLike = {
  source?: "all" | "user" | "remote";
  scope?: "all" | "document" | "session" | "presence";
};

type StoreLike = {
  listen: (
    onHistory: (entry: StoreHistoryEntryLike) => void,
    filters?: StoreListenFiltersLike
  ) => () => void;
};

/**
 * 生成 AI 可读画布上下文所需的最小 editor surface。保持窄 adapter 可以让测试不依赖
 * 完整 tldraw Editor 类型，也明确记录 AI pipeline 到底读取哪些字段。
 */
export type RoomContextEditor = {
  getCurrentPageShapes: () => ShapeLike[];
  getSelectedShapeIds: () => string[];
  getShapePageBounds?: unknown;
  getViewportPageBounds: () => BoundsLike;
  getZoomLevel?: () => number;
  store?: StoreLike;
};

/**
 * 复制到 snapshots 和 events 中的浏览器/session 身份，用于 diagnostics 和 room 级关联。
 */
export type WebContextSourceInput = {
  deviceId: string;
  sessionId: string;
  tabId: string;
};

/**
 * 定义一次 canvas snapshot 提取所需的输入。
 */
export type ExtractCanvasSnapshotInput = {
  roomId: string;
  source: WebContextSourceInput;
  capturedAt: string;
  snapshotVersion: number;
  eventVersionAtSnapshot: number;
};

/**
 * web 向 server 发送 room context 的传输边界。
 */
export type RoomContextPublisher = {
  publishSnapshot: (snapshot: CanvasSnapshot) => Promise<PublishResult>;
  publishEvent: (event: RoomOperationEvent) => Promise<PublishResult>;
  getContext: () => Promise<RoomContextFeed | null>;
};

/**
 * context 发布调用的公共结果形态。UI 可以渲染 raw failure，而不需要在事件处理器中抛错。
 */
export type PublishResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

/**
 * tldraw room 挂载期间注册到 `window` 上的开发者 runtime hook。测试、smoke 检查
 * 和 raw Mate 面板会用它在请求 mate 前发布当前 context。
 */
export type RoomContextRuntimeApi = {
  extractSnapshot: () => CanvasSnapshot;
  publishSnapshot: () => Promise<PublishResult & { snapshot?: CanvasSnapshot }>;
  emitCanvasChange: (input?: {
    affectedShapeIds?: string[];
    summary?: string;
  }) => Promise<PublishResult>;
  emitSelectionChange: () => Promise<PublishResult>;
  emitViewportChange: () => Promise<PublishResult>;
  emitChatBoundary: (message: string) => Promise<PublishResult>;
  getServerContext: () => Promise<RoomContextFeed | null>;
};

export const ROOM_CONTEXT_AUTO_EVENT = "psg:room-context:auto";

export type RoomContextAutoEventDetail = {
  kind: "canvas-change" | "selection-change" | "viewport-change";
  roomId: string;
  snapshotVersion: number;
  eventVersion: number;
};

/**
 * 从当前 tldraw editor 提取有边界、经过 schema 校验的 snapshot。
 *
 * snapshot 刻意保持精简：捕获 shape id/type/text、可选 bounds、selection、
 * viewport 和 freshness counters，而不是完整 tldraw document。
 */
export function extractCanvasSnapshotFromEditor(
  editor: RoomContextEditor,
  input: ExtractCanvasSnapshotInput
): CanvasSnapshot {
  const shapes = editor.getCurrentPageShapes().map((shape) => ({
    id: String(shape.id),
    type: String(shape.type),
    ...(extractShapeText(shape) ? { text: extractShapeText(shape) } : {}),
    ...(getShapeBounds(editor, shape)
      ? { bounds: getShapeBounds(editor, shape) }
      : {})
  }));

  const snapshot = {
    schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
    roomId: input.roomId,
    source: createSource(input.source, input.capturedAt),
    document: {
      shapeCount: shapes.length,
      shapes
    },
    selection: {
      selectedShapeIds: editor.getSelectedShapeIds().map(String)
    },
    viewport: {
      pageBounds: normalizeBounds(editor.getViewportPageBounds()) ?? {
        x: 0,
        y: 0,
        w: 0,
        h: 0
      },
      zoom: editor.getZoomLevel?.() ?? 1
    },
    freshness: {
      snapshotVersion: input.snapshotVersion,
      eventVersionAtSnapshot: input.eventVersionAtSnapshot
    }
  };

  return canvasSnapshotSchema.parse(snapshot);
}

/**
 * 为 room context stream 创建 chat-boundary event。完整消息通过 `/mate/messages`
 * 发送；这个 event 只记录当前 event version 之后发生了一次用户交互。
 */
export function createChatBoundaryOperationEvent(input: {
  roomId: string;
  source: WebContextSourceInput;
  eventId: string;
  eventVersion: number;
  occurredAt: string;
  message: string;
}): RoomOperationEvent {
  return createChatBoundaryEvent({
    roomId: input.roomId,
    eventId: input.eventId,
    eventVersion: input.eventVersion,
    source: createSource(input.source, input.occurredAt),
    occurredAt: input.occurredAt,
    messageLength: input.message.length
  });
}

/**
 * 创建浏览器 runtime 使用的 HTTP publisher，用于向 backend 发送 snapshots、
 * operation events，以及读取 diagnostic context。
 */
export function createRoomContextPublisher(input: {
  baseUrl: string;
  roomId: string;
  fetch?: typeof globalThis.fetch;
}): RoomContextPublisher {
  const fetcher = input.fetch ?? globalThis.fetch.bind(globalThis);
  const baseUrl = input.baseUrl.replace(/\/$/, "");
  const roomPath = encodeURIComponent(input.roomId);

  return {
    async publishSnapshot(snapshot) {
      return postJson(
        fetcher,
        `${baseUrl}/rooms/${roomPath}/context/snapshot`,
        snapshot
      );
    },
    async publishEvent(event) {
      return postJson(fetcher, `${baseUrl}/rooms/${roomPath}/context/events`, event);
    },
    async getContext() {
      const response = await fetcher(`${baseUrl}/rooms/${roomPath}/context`).catch(
        () => null
      );
      if (!response?.ok) {
        return null;
      }
      const body = (await response.json()) as { context?: RoomContextFeed };
      return body.context ?? null;
    }
  };
}

/**
 * 为已挂载的 tldraw editor 注册 room context runtime。
 *
 * runtime 会立即发布初始 snapshot，并暴露命令式 helpers 供调试、E2E 和 chat
 * boundary 继续复用；默认还会监听 tldraw store，把用户的 document/session
 * 变化自动发布到 server，让 AI gateway 不再依赖手动 console emit。
 */
export function registerRoomContextRuntime(
  editor: RoomContextEditor,
  input: {
    baseUrl: string;
    roomId: string;
    source: WebContextSourceInput;
    autoPublish?: {
      enabled?: boolean;
      debounceMs?: number;
    };
  }
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const publisher = createRoomContextPublisher({
    baseUrl: input.baseUrl,
    roomId: input.roomId
  });
  let snapshotVersion = 0;
  let eventVersion = 0;
  const autoPublish = {
    enabled: input.autoPublish?.enabled ?? true,
    debounceMs: input.autoPublish?.debounceMs ?? 650
  };
  const cleanupTasks: Array<() => void> = [];
  let canvasTimer: number | undefined;
  let viewportTimer: number | undefined;
  let previousSelectionKey = "";
  let previousViewportKey = "";

  /**
   * 从 editor 读取一份指定版本的 snapshot。读取当前上下文不能顺手递增版本；
   * 只有真正发布到 server 的 snapshot 才应该成为下一版，否则 AI Drop 轮询会把
   * 自己的只读检查误判成 freshness 变化。
   */
  const extractSnapshotAtVersion = (version: number) =>
    extractCanvasSnapshotFromEditor(editor, {
      roomId: input.roomId,
      source: input.source,
      capturedAt: new Date().toISOString(),
      snapshotVersion: version,
      eventVersionAtSnapshot: eventVersion
    });

  const nextEventBase = () => {
    eventVersion += 1;
    return {
      eventId: `event:${Date.now()}:${eventVersion}`,
      eventVersion,
      occurredAt: new Date().toISOString()
    };
  };

  const api: RoomContextRuntimeApi = {
    extractSnapshot() {
      return extractSnapshotAtVersion(Math.max(1, snapshotVersion));
    },
    async publishSnapshot() {
      const snapshot = extractSnapshotAtVersion(snapshotVersion + 1);
      snapshotVersion = snapshot.freshness.snapshotVersion;
      const result = await publisher.publishSnapshot(snapshot);
      return result.ok ? { ...result, snapshot } : result;
    },
    async emitCanvasChange(eventInput = {}) {
      const event = createCanvasChangeEvent({
        roomId: input.roomId,
        source: createSource(input.source, new Date().toISOString()),
        ...nextEventBase(),
        affectedShapeIds: eventInput.affectedShapeIds ?? [],
        summary: eventInput.summary ?? "canvas context changed"
      });
      roomOperationEventSchema.parse(event);
      return publisher.publishEvent(event);
    },
    async emitSelectionChange() {
      const event = createSelectionChangeEvent({
        roomId: input.roomId,
        source: createSource(input.source, new Date().toISOString()),
        ...nextEventBase(),
        selectedShapeIds: editor.getSelectedShapeIds().map(String)
      });
      return publisher.publishEvent(event);
    },
    async emitViewportChange() {
      const bounds = normalizeBounds(editor.getViewportPageBounds()) ?? {
        x: 0,
        y: 0,
        w: 0,
        h: 0
      };
      const event = createViewportChangeEvent({
        roomId: input.roomId,
        source: createSource(input.source, new Date().toISOString()),
        ...nextEventBase(),
        pageBounds: bounds,
        zoom: editor.getZoomLevel?.() ?? 1
      });
      return publisher.publishEvent(event);
    },
    async emitChatBoundary(message) {
      return publisher.publishEvent(
        createChatBoundaryOperationEvent({
          roomId: input.roomId,
          source: input.source,
          ...nextEventBase(),
          message
        })
      );
    },
    getServerContext() {
      return publisher.getContext();
    }
  };

  window.__PSG_ROOM_CONTEXT__ = api;
  void api.publishSnapshot();

  if (autoPublish.enabled) {
    cleanupTasks.push(
      registerAutomaticContextPublishing(editor, api, {
        roomId: input.roomId,
        debounceMs: autoPublish.debounceMs,
        getSnapshotVersion: () => snapshotVersion,
        getEventVersion: () => eventVersion,
        setCanvasTimer: (timer) => {
          canvasTimer = timer;
        },
        getCanvasTimer: () => canvasTimer,
        setViewportTimer: (timer) => {
          viewportTimer = timer;
        },
        getViewportTimer: () => viewportTimer,
        getPreviousSelectionKey: () => previousSelectionKey,
        setPreviousSelectionKey: (key) => {
          previousSelectionKey = key;
        },
        getPreviousViewportKey: () => previousViewportKey,
        setPreviousViewportKey: (key) => {
          previousViewportKey = key;
        }
      })
    );
  }

  return () => {
    cleanupTasks.forEach((cleanup) => cleanup());
    if (canvasTimer !== undefined) {
      window.clearTimeout(canvasTimer);
    }
    if (viewportTimer !== undefined) {
      window.clearTimeout(viewportTimer);
    }
    if (window.__PSG_ROOM_CONTEXT__ === api) {
      delete window.__PSG_ROOM_CONTEXT__;
    }
  };
}

/**
 * 自动把 tldraw store 变化转成 AI gateway 可读的 context feed。document 变化代表
 * 作者行为，会发布 canvas-change + snapshot；session 变化只补充 selection/viewport
 * 事实，不直接触发 AI Drop。
 */
function registerAutomaticContextPublishing(
  editor: RoomContextEditor,
  api: RoomContextRuntimeApi,
  state: {
    roomId: string;
    debounceMs: number;
    getSnapshotVersion: () => number;
    getEventVersion: () => number;
    setCanvasTimer: (timer: number | undefined) => void;
    getCanvasTimer: () => number | undefined;
    setViewportTimer: (timer: number | undefined) => void;
    getViewportTimer: () => number | undefined;
    getPreviousSelectionKey: () => string;
    setPreviousSelectionKey: (key: string) => void;
    getPreviousViewportKey: () => string;
    setPreviousViewportKey: (key: string) => void;
  }
) {
  const cleanups: Array<() => void> = [];
  if (!editor.store?.listen) {
    return () => undefined;
  }

  cleanups.push(
    editor.store.listen(
      () => {
        const currentTimer = state.getCanvasTimer();
        if (currentTimer !== undefined) {
          window.clearTimeout(currentTimer);
        }
        state.setCanvasTimer(
          window.setTimeout(() => {
            state.setCanvasTimer(undefined);
            void publishAutomaticCanvasChange(api, state.roomId, editor);
          }, state.debounceMs)
        );
      },
      { source: "user", scope: "document" }
    )
  );

  cleanups.push(
    editor.store.listen(
      () => {
        publishSelectionIfChanged(editor, api, state);
        scheduleViewportPublish(editor, api, state);
      },
      { source: "user", scope: "session" }
    )
  );

  return () => cleanups.forEach((cleanup) => cleanup());
}

/**
 * 发布一次“用户真的改了画布”的证据。这里先发 operation event，再发 snapshot，
 * 成功后通知浏览器内的 AI Drop runtime 可以考虑请求补全。
 */
async function publishAutomaticCanvasChange(
  api: RoomContextRuntimeApi,
  roomId: string,
  editor?: RoomContextEditor
) {
  const eventResult = await api.emitCanvasChange({
    affectedShapeIds: editor?.getSelectedShapeIds().map(String) ?? [],
    summary: editor
      ? createAutomaticCanvasChangeSummary(editor)
      : "user edited canvas"
  });
  const snapshotResult = eventResult.ok
    ? await api.publishSnapshot()
    : { ok: false as const, error: eventResult.error };
  if (eventResult.ok && snapshotResult.ok && snapshotResult.snapshot) {
    dispatchRoomContextAutoEvent({
      kind: "canvas-change",
      roomId,
      snapshotVersion: snapshotResult.snapshot.freshness.snapshotVersion,
      eventVersion: snapshotResult.snapshot.freshness.eventVersionAtSnapshot
    });
  }
}

/**
 * 给自动 canvas-change 生成轻量摘要。这个摘要不是 prompt 全文，而是给后端
 * intent router 一个最近行为信号：更像 text 输入，还是流程图附近编辑。
 */
function createAutomaticCanvasChangeSummary(editor: RoomContextEditor): string {
  const selectedIds = editor.getSelectedShapeIds().map(String);
  const selectedShape = editor
    .getCurrentPageShapes()
    .find((shape) => selectedIds.includes(String(shape.id)));
  if (!selectedShape) {
    return "user edited canvas";
  }
  if (String(selectedShape.type) === "text") {
    return `text edited in ${selectedShape.id}`;
  }
  if (/geo|draw|arrow|connector|node|shape/i.test(String(selectedShape.type))) {
    return `flow edited near ${selectedShape.id}`;
  }
  return `shape edited: ${selectedShape.id}`;
}

/**
 * 只在 selection 真的变化时发布事件。selection 是 AI 感知上下文，但不代表
 * 用户正在创作，因此这里只补 feed，不触发补全。
 */
function publishSelectionIfChanged(
  editor: RoomContextEditor,
  api: RoomContextRuntimeApi,
  state: {
    roomId: string;
    getSnapshotVersion: () => number;
    getEventVersion: () => number;
    getPreviousSelectionKey: () => string;
    setPreviousSelectionKey: (key: string) => void;
  }
) {
  const key = editor.getSelectedShapeIds().map(String).sort().join("|");
  if (key === state.getPreviousSelectionKey()) {
    return;
  }
  state.setPreviousSelectionKey(key);
  void api.emitSelectionChange().then((result) => {
    if (result.ok) {
      dispatchRoomContextAutoEvent({
        kind: "selection-change",
        roomId: state.roomId,
        snapshotVersion: state.getSnapshotVersion(),
        eventVersion: state.getEventVersion()
      });
    }
  });
}

/**
 * viewport 变化频率很高，所以这里做 debounce 和去重；它帮助 agent 理解用户
 * 当前关注区域，但不会单独打开 provider 调用。
 */
function scheduleViewportPublish(
  editor: RoomContextEditor,
  api: RoomContextRuntimeApi,
  state: {
    roomId: string;
    debounceMs: number;
    getSnapshotVersion: () => number;
    getEventVersion: () => number;
    getViewportTimer: () => number | undefined;
    setViewportTimer: (timer: number | undefined) => void;
    getPreviousViewportKey: () => string;
    setPreviousViewportKey: (key: string) => void;
  }
) {
  const key = createViewportKey(editor);
  if (key === state.getPreviousViewportKey()) {
    return;
  }
  state.setPreviousViewportKey(key);
  const currentTimer = state.getViewportTimer();
  if (currentTimer !== undefined) {
    window.clearTimeout(currentTimer);
  }
  state.setViewportTimer(
    window.setTimeout(() => {
      state.setViewportTimer(undefined);
      void api.emitViewportChange().then((result) => {
        if (result.ok) {
          dispatchRoomContextAutoEvent({
            kind: "viewport-change",
            roomId: state.roomId,
            snapshotVersion: state.getSnapshotVersion(),
            eventVersion: state.getEventVersion()
          });
        }
      });
    }, state.debounceMs)
  );
}

/**
 * 在浏览器内广播自动 context 事件。前端 AI Drop 只监听 canvas-change，
 * selection/viewport 事件留给诊断或后续更细的 AI 感知使用。
 */
function dispatchRoomContextAutoEvent(detail: RoomContextAutoEventDetail) {
  window.dispatchEvent(new CustomEvent(ROOM_CONTEXT_AUTO_EVENT, { detail }));
}

/**
 * 将 sync WebSocket room URI 转换为 context、mate 和 diagnostics endpoints 使用的
 * HTTP base URL。
 */
export function createContextBaseUrlFromRoomUri(roomUri: string): string {
  const url = new URL(roomUri);
  if (url.protocol === "ws:") {
    url.protocol = "http:";
  } else if (url.protocol === "wss:") {
    url.protocol = "https:";
  }
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

/**
 * POST JSON，并把 network/server failure 标准化成 `PublishResult`。
 */
async function postJson(
  fetcher: typeof globalThis.fetch,
  url: string,
  body: unknown
): Promise<PublishResult> {
  const response = await fetcher(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false as const, error: message };
  });
  if ("error" in response) {
    return { ok: false, error: response.error };
  }
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      error:
        typeof value?.error?.message === "string"
          ? value.error.message
          : `Request failed with status ${response.status}`
    };
  }
  return { ok: true, value };
}

/**
 * 给 snapshot 或 event 时间戳附加稳定的浏览器/session 元数据。
 */
function createSource(
  source: WebContextSourceInput,
  capturedAt: string
): RoomContextSource {
  return {
    kind: "web",
    deviceId: source.deviceId,
    sessionId: source.sessionId,
    tabId: source.tabId,
    capturedAt
  };
}

/**
 * 从 tldraw shape props 对象中提取文本。支持简单 `text` props 和嵌套 rich-text 内容。
 */
function extractShapeText(shape: ShapeLike): string | null {
  if (!shape.props || typeof shape.props !== "object") {
    return null;
  }
  const props = shape.props as { text?: unknown; richText?: unknown };
  if (typeof props.text === "string" && props.text.length > 0) {
    return props.text;
  }
  const richText = extractRichText(props.richText).trim();
  return richText.length > 0 ? richText : null;
}

/**
 * 从 editor 读取可选 shape page bounds，并标准化为 shared bounds contract。
 */
function getShapeBounds(editor: RoomContextEditor, shape: ShapeLike) {
  if (typeof editor.getShapePageBounds !== "function") {
    return null;
  }
  return normalizeBounds(editor.getShapePageBounds(shape));
}

/**
 * 递归展开 tldraw rich-text-like nodes，生成 AI context 使用的纯文本片段。
 */
function extractRichText(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }
  const node = value as { text?: unknown; content?: unknown };
  const ownText = typeof node.text === "string" ? node.text : "";
  const childText = Array.isArray(node.content)
    ? node.content.map(extractRichText).join(" ")
    : "";
  return `${ownText} ${childText}`.trim();
}

/**
 * 将 tldraw bounds-like values 标准化为 `{ x, y, w, h }`，同时支持直接对象和带
 * `toJson()` 的对象。
 */
function normalizeBounds(bounds: BoundsLike | null | undefined) {
  const raw = bounds?.toJson?.() ?? bounds;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const value = raw as {
    x?: unknown;
    y?: unknown;
    w?: unknown;
    h?: unknown;
    width?: unknown;
    height?: unknown;
  };
  const x = typeof value.x === "number" ? value.x : 0;
  const y = typeof value.y === "number" ? value.y : 0;
  const w =
    typeof value.w === "number"
      ? value.w
      : typeof value.width === "number"
        ? value.width
        : 0;
  const h =
    typeof value.h === "number"
      ? value.h
      : typeof value.height === "number"
        ? value.height
        : 0;

  return { x, y, w, h };
}

function createViewportKey(editor: RoomContextEditor): string {
  const bounds = normalizeBounds(editor.getViewportPageBounds()) ?? {
    x: 0,
    y: 0,
    w: 0,
    h: 0
  };
  return [
    bounds.x,
    bounds.y,
    bounds.w,
    bounds.h,
    editor.getZoomLevel?.() ?? 1
  ].join("|");
}

declare global {
  interface Window {
    __PSG_ROOM_CONTEXT__?: RoomContextRuntimeApi;
  }
}
