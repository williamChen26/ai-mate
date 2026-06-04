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
  publishSnapshot: () => Promise<PublishResult>;
  emitCanvasChange: (input?: {
    affectedShapeIds?: string[];
    summary?: string;
  }) => Promise<PublishResult>;
  emitSelectionChange: () => Promise<PublishResult>;
  emitViewportChange: () => Promise<PublishResult>;
  emitChatBoundary: (message: string) => Promise<PublishResult>;
  getServerContext: () => Promise<RoomContextFeed | null>;
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
 * runtime 会立即发布初始 snapshot，并暴露命令式 helpers 供后续发布 snapshot/event。
 * 当前没有绑定 tldraw change listener；除初始发布外，snapshot 只会在 raw Mate
 * 面板、E2E 或开发者手动调用 runtime helper 时再次发布。
 * 当前 raw Mate 面板会在发送用户消息前调用 `publishSnapshot` 和 `emitChatBoundary`；
 * 未来可以把 tldraw change listeners 接到同一组方法上。
 */
export function registerRoomContextRuntime(
  editor: RoomContextEditor,
  input: {
    baseUrl: string;
    roomId: string;
    source: WebContextSourceInput;
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
      return extractCanvasSnapshotFromEditor(editor, {
        roomId: input.roomId,
        source: input.source,
        capturedAt: new Date().toISOString(),
        snapshotVersion: snapshotVersion + 1,
        eventVersionAtSnapshot: eventVersion
      });
    },
    async publishSnapshot() {
      const snapshot = api.extractSnapshot();
      snapshotVersion = snapshot.freshness.snapshotVersion;
      return publisher.publishSnapshot(snapshot);
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
  // 当前唯一自动发布点：editor mount 后发送一份初始 snapshot。后续画布变化不会
  // 自动触发这里，除非调用上面暴露的 runtime helper。
  void api.publishSnapshot();

  return () => {
    if (window.__PSG_ROOM_CONTEXT__ === api) {
      delete window.__PSG_ROOM_CONTEXT__;
    }
  };
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

declare global {
  interface Window {
    __PSG_ROOM_CONTEXT__?: RoomContextRuntimeApi;
  }
}
