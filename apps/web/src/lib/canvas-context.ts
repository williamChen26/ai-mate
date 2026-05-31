/**
 * 画布上下文是实时 tldraw 编辑器和未来 AI/智能体代码之间的纯模型边界。
 * 这个模块采用适配器 + 纯构建器模式：适配器负责把编辑器专属记录
 * 归一化为 `CanvasContextInput`，`buildCanvasContext` 只返回 JSON 安全的纯数据，
 * 不包含编辑器实例、函数、类对象或可变的 tldraw 引用。
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type CanvasContextSource = {
  kind: "tldraw";
  sourceOfTruth: "tldraw-editor-store-document-state";
  adapter: "psg-web-canvas-context-v1";
};

export type CanvasBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasCamera = {
  x: number;
  y: number;
  z: number;
};

export type CanvasShapeInput = {
  id: string;
  type: string;
  parentId?: string;
  x?: number;
  y?: number;
  rotation?: number;
  props?: unknown;
  bounds?: CanvasBounds;
};

export type CanvasShapeInventoryItem = {
  id: string;
  type: string;
  parentId?: string;
  x: number;
  y: number;
  rotation: number;
  bounds?: CanvasBounds;
  text?: string;
  propKeys: string[];
};

export type RecentCanvasChangeSummaryInput = {
  scope: "local-session";
  observedChangeCount: number;
  affectedRecordIds: string[];
  affectedShapeIds: string[];
  lastChangeSource?: "user" | "remote";
};

export type RecentCanvasChangeSummary = RecentCanvasChangeSummaryInput & {
  hasObservedChanges: boolean;
  note: "Local/session bookkeeping only; not AI interpretation or collaboration history.";
};

export type CanvasContextInput = {
  shapes: CanvasShapeInput[];
  selectedShapeIds: string[];
  viewport: {
    camera: CanvasCamera;
    pageBounds: CanvasBounds;
  };
  documentBounds?: CanvasBounds;
  recentChanges: RecentCanvasChangeSummaryInput;
};

export type CanvasContext = {
  schemaVersion: 1;
  source: CanvasContextSource;
  document: {
    shapeCount: number;
    selectedShapeCount: number;
    shapeTypes: Record<string, number>;
    bounds?: CanvasBounds;
  };
  shapes: CanvasShapeInventoryItem[];
  selection: {
    count: number;
    shapeIds: string[];
  };
  viewport: {
    camera: CanvasCamera;
    pageBounds: CanvasBounds;
  };
  recentChanges: RecentCanvasChangeSummary;
  futureAgentConstraints: {
    sourceOfTruth: "tldraw editor/store/document state";
    unsupportedAssumptions: [
      "no-ai-model-calls",
      "no-chat-ui",
      "no-autonomous-edits",
      "no-real-collaboration",
      "no-custom-flowchart-protocol-authority"
    ];
    actionSafety: "Context extraction is read-only and does not apply canvas edits.";
  };
};

const SOURCE: CanvasContextSource = {
  kind: "tldraw",
  sourceOfTruth: "tldraw-editor-store-document-state",
  adapter: "psg-web-canvas-context-v1"
};

const UNSUPPORTED_ASSUMPTIONS: CanvasContext["futureAgentConstraints"]["unsupportedAssumptions"] = [
  "no-ai-model-calls",
  "no-chat-ui",
  "no-autonomous-edits",
  "no-real-collaboration",
  "no-custom-flowchart-protocol-authority"
];

/**
 * 构建未来智能体提示词和动作规划消费的标准 JSON 安全画布快照。
 * 这个函数刻意保持纯函数：调用方传入归一化记录，返回值复制数组和对象，
 * 因而后续编辑器变化不会反向修改已经抽取出的上下文。
 */
export function buildCanvasContext(input: CanvasContextInput): CanvasContext {
  const shapes = input.shapes.map(toInventoryItem);
  const shapeTypes = shapes.reduce<Record<string, number>>((acc, shape) => {
    return {
      ...acc,
      [shape.type]: (acc[shape.type] ?? 0) + 1
    };
  }, {});
  const selectedShapeIds = [...input.selectedShapeIds];

  return {
    schemaVersion: 1,
    source: { ...SOURCE },
    document: {
      shapeCount: shapes.length,
      selectedShapeCount: selectedShapeIds.length,
      shapeTypes,
      ...(input.documentBounds ? { bounds: { ...input.documentBounds } } : {})
    },
    shapes,
    selection: {
      count: selectedShapeIds.length,
      shapeIds: selectedShapeIds
    },
    viewport: {
      camera: { ...input.viewport.camera },
      pageBounds: { ...input.viewport.pageBounds }
    },
    recentChanges: {
      ...input.recentChanges,
      affectedRecordIds: [...input.recentChanges.affectedRecordIds],
      affectedShapeIds: [...input.recentChanges.affectedShapeIds],
      hasObservedChanges: input.recentChanges.observedChangeCount > 0,
      note: "Local/session bookkeeping only; not AI interpretation or collaboration history."
    },
    futureAgentConstraints: {
      sourceOfTruth: "tldraw editor/store/document state",
      unsupportedAssumptions: [...UNSUPPORTED_ASSUMPTIONS],
      actionSafety:
        "Context extraction is read-only and does not apply canvas edits."
    }
  };
}

/**
 * 将一个归一化后的 tldraw 图形转成智能体可检查的紧凑清单项。
 * 清单项保留身份、几何信息、文本提示和属性键，但不暴露可能包含不稳定
 * tldraw 内部结构的原始属性。
 */
function toInventoryItem(shape: CanvasShapeInput): CanvasShapeInventoryItem {
  const text = extractTextFromProps(shape.props);
  return {
    id: shape.id,
    type: shape.type,
    ...(shape.parentId ? { parentId: shape.parentId } : {}),
    x: finiteNumberOrZero(shape.x),
    y: finiteNumberOrZero(shape.y),
    rotation: finiteNumberOrZero(shape.rotation),
    ...(shape.bounds ? { bounds: { ...shape.bounds } } : {}),
    ...(text ? { text } : {}),
    propKeys: getObjectKeys(shape.props)
  };
}

/**
 * 清洗编辑器记录里的可选数字字段。未知、无限大或缺失的数字都会降级为 0，
 * 这样上下文对测试和智能体消费者来说始终可序列化且可预测。
 */
function finiteNumberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * 返回排序后的属性键，用于能力检测，同时避免复制完整属性对象。
 * 后续动作验证就是通过这个信息判断某个图形是否承载文本，
 * 并且仍然让上下文保持轻量。
 */
function getObjectKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.keys(value).sort();
}

/**
 * 从常见 tldraw 图形属性中尽力抽取人类可读的文本预览。函数把富文本
 * 当成不透明树处理，只收集文本叶子节点，从而保持上下文层“摘要化”而不是
 * 完整镜像编辑器模型的架构原则。
 */
function extractTextFromProps(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  if ("text" in value && typeof value.text === "string") {
    return trimText(value.text);
  }

  if ("richText" in value) {
    return trimText(collectRichText(value.richText));
  }

  return undefined;
}

/**
 * 递归地把 tldraw rich text 风格的树压平成纯文本。这个 helper 是防御性的，
 * 因为富文本结构可能随图形类型和 tldraw 版本变化。
 */
function collectRichText(value: unknown): string {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(collectRichText).filter(Boolean).join(" ");
  }

  if (typeof value !== "object") {
    return "";
  }

  const maybeText = "text" in value && typeof value.text === "string" ? value.text : "";
  const maybeContent =
    "content" in value ? collectRichText(value.content) : "";

  return [maybeText, maybeContent].filter(Boolean).join(" ");
}

/**
 * 归一化空白字符，并过滤掉空文本预览。返回 `undefined` 可以让调用方完全省略
 * 可选的 `text` 字段。
 */
function trimText(value: string): string | undefined {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
