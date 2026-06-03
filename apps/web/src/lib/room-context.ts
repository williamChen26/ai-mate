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

export type RoomContextEditor = {
  getCurrentPageShapes: () => ShapeLike[];
  getSelectedShapeIds: () => string[];
  getShapePageBounds?: unknown;
  getViewportPageBounds: () => BoundsLike;
  getZoomLevel?: () => number;
};

export type WebContextSourceInput = {
  deviceId: string;
  sessionId: string;
  tabId: string;
};

export type ExtractCanvasSnapshotInput = {
  roomId: string;
  source: WebContextSourceInput;
  capturedAt: string;
  snapshotVersion: number;
  eventVersionAtSnapshot: number;
};

export type RoomContextPublisher = {
  publishSnapshot: (snapshot: CanvasSnapshot) => Promise<PublishResult>;
  publishEvent: (event: RoomOperationEvent) => Promise<PublishResult>;
  getContext: () => Promise<RoomContextFeed | null>;
};

export type PublishResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

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
  void api.publishSnapshot();

  return () => {
    if (window.__PSG_ROOM_CONTEXT__ === api) {
      delete window.__PSG_ROOM_CONTEXT__;
    }
  };
}

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

function getShapeBounds(editor: RoomContextEditor, shape: ShapeLike) {
  if (typeof editor.getShapePageBounds !== "function") {
    return null;
  }
  return normalizeBounds(editor.getShapePageBounds(shape));
}

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
