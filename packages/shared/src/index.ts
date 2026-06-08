import { z } from "zod";

/**
 * web 生成、server/mate 消费的画布上下文 payload 版本标识。
 */
export const CANVAS_CONTEXT_SCHEMA_VERSION = "canvas-context.v1";

/**
 * mate 返回、server 校验、web 渲染或未来执行前使用的 AI 输出版本标识。
 */
export const AGENT_OUTPUT_SCHEMA_VERSION = "agent-output.v1";

/**
 * room 进入 AI 网关时使用的请求版本。它只描述触发和上下文边界，
 * 不承诺后续 agent 决策、工具调用或画布修改。
 */
export const AI_GATEWAY_SCHEMA_VERSION = "ai-gateway.v1";

const ROOM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_ROOM_ID_LENGTH = 80;
const MAX_TEXT_LENGTH = 8_000;

const finiteNumberSchema = z.number().finite();

/**
 * room id 的公共约束，路由解析、后端协同房间、上下文 payload、mate turn
 * 和 diagnostics 都共用这份规则。
 */
export const roomIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_ROOM_ID_LENGTH)
  .regex(ROOM_ID_PATTERN);

/**
 * 标准化页面坐标矩形，用于 viewport 和可选的 shape bounds。
 */
export const boundsSchema = z.object({
  x: finiteNumberSchema,
  y: finiteNumberSchema,
  w: finiteNumberSchema.nonnegative(),
  h: finiteNumberSchema.nonnegative()
});

/**
 * 附在画布 snapshot 和 operation event 上的浏览器/session 元数据。
 * diagnostics 可以据此把上下文关联到产生它的 tab，同时避免使用个人身份信息。
 */
export const roomContextSourceSchema = z.object({
  kind: z.literal("web"),
  deviceId: z.string().min(1).max(160),
  sessionId: z.string().min(1).max(220),
  tabId: z.string().min(1).max(160),
  capturedAt: z.string().datetime()
});

/**
 * 从 tldraw 提取的精简 shape 摘要。AI 上下文刻意不复制完整编辑器文档，
 * 只保留对推理有用且有边界的事实。
 */
export const canvasShapeSnapshotSchema = z.object({
  id: z.string().min(1).max(220),
  type: z.string().min(1).max(80),
  text: z.string().max(MAX_TEXT_LENGTH).nullable().optional(),
  bounds: boundsSchema.optional()
});

/**
 * 某一时刻的画布 snapshot。snapshot 是较重的上下文 payload，包含当前
 * shapes、selection、viewport 和 freshness 元数据。
 */
export const canvasSnapshotSchema = z
  .object({
    schemaVersion: z.literal(CANVAS_CONTEXT_SCHEMA_VERSION),
    roomId: roomIdSchema,
    source: roomContextSourceSchema,
    document: z.object({
      shapeCount: z.number().int().nonnegative(),
      shapes: z.array(canvasShapeSnapshotSchema).max(2_000)
    }),
    selection: z.object({
      selectedShapeIds: z.array(z.string().min(1).max(220)).max(2_000)
    }),
    viewport: z.object({
      pageBounds: boundsSchema,
      zoom: finiteNumberSchema.positive()
    }),
    freshness: z.object({
      snapshotVersion: z.number().int().nonnegative(),
      eventVersionAtSnapshot: z.number().int().nonnegative()
    })
  })
  .refine(
    (snapshot) => snapshot.document.shapeCount === snapshot.document.shapes.length,
    {
      message: "shapeCount must match shapes length",
      path: ["document", "shapeCount"]
    }
  );

const eventBaseSchema = z.object({
  schemaVersion: z.literal(CANVAS_CONTEXT_SCHEMA_VERSION),
  roomId: roomIdSchema,
  eventId: z.string().min(1).max(220),
  eventVersion: z.number().int().positive(),
  source: roomContextSourceSchema,
  occurredAt: z.string().datetime()
});

/**
 * snapshot 之间画布内容变化时产生的 operation event。
 */
export const canvasChangeEventSchema = eventBaseSchema.extend({
  kind: z.literal("canvas-change"),
  affectedShapeIds: z.array(z.string().min(1).max(220)).max(2_000),
  summary: z.string().min(1).max(1_000)
});

/**
 * selection 变化时产生的 operation event。它告诉 mate 用户可能正在关注什么，
 * 同时避免每次 selection 变化都上传完整 snapshot。
 */
export const selectionChangeEventSchema = eventBaseSchema.extend({
  kind: z.literal("selection-change"),
  selectedShapeIds: z.array(z.string().min(1).max(220)).max(2_000)
});

/**
 * viewport 或 zoom 变化时产生的 operation event。
 */
export const viewportChangeEventSchema = eventBaseSchema.extend({
  kind: z.literal("viewport-change"),
  pageBounds: boundsSchema,
  zoom: finiteNumberSchema.positive()
});

/**
 * 用户发送聊天消息时产生的 operation event。消息正文通过 mate message endpoint
 * 发送；这个 event 只在 room context feed 中记录一次交互边界。
 */
export const chatBoundaryEventSchema = eventBaseSchema.extend({
  kind: z.literal("chat-boundary"),
  messageLength: z.number().int().nonnegative().max(MAX_TEXT_LENGTH)
});

/**
 * 当前 mate 可消费的所有标准化 room operation 联合类型。
 */
export const roomOperationEventSchema = z.discriminatedUnion("kind", [
  canvasChangeEventSchema,
  selectionChangeEventSchema,
  viewportChangeEventSchema,
  chatBoundaryEventSchema
]);

/**
 * freshness 元数据，用来比较最新 snapshot 和 room 内最新 operation event。
 */
export const contextFreshnessSchema = z.object({
  snapshotVersion: z.number().int().nonnegative(),
  eventVersion: z.number().int().nonnegative(),
  changedSinceSnapshot: z.boolean()
});

/**
 * server 给 mate 的完整 room context feed：最新 snapshot、近期 operations、
 * freshness，以及可选的 agent 关联信息。
 */
export const roomContextFeedSchema = z.object({
  roomId: roomIdSchema,
  agentSessionId: z.string().min(1).max(220).optional(),
  latestSnapshot: canvasSnapshotSchema.nullable(),
  recentEvents: z.array(roomOperationEventSchema).max(2_000),
  freshness: contextFreshnessSchema,
  generatedAt: z.string().datetime()
});

const gatewayRequestIdSchema = z.string().min(1).max(220);

const gatewayConversationSourceIdentitySchema = z.object({
  kind: z.literal("web"),
  deviceId: z.string().min(1).max(160),
  sessionId: z.string().min(1).max(220),
  tabId: z.string().min(1).max(160),
  sentAt: z.string().datetime()
});

const gatewayServerContextSourceMetadataSchema = z.object({
  origin: z.literal("server-context-feed"),
  feedGeneratedAt: z.string().datetime().optional(),
  source: roomContextSourceSchema.optional(),
  eventId: z.string().min(1).max(220).optional(),
  eventVersion: z.number().int().positive().optional(),
  boundedTo: z.number().int().positive().optional(),
  eventCountBeforeBounding: z.number().int().nonnegative().optional()
});

const gatewayFrontendRuntimeSourceMetadataSchema = z.object({
  origin: z.literal("front-end-runtime-signal"),
  source: roomContextSourceSchema.optional(),
  sentAt: z.string().datetime().optional()
});

export const gatewayContextSourceMetadataSchema = z.discriminatedUnion("origin", [
  gatewayServerContextSourceMetadataSchema,
  gatewayFrontendRuntimeSourceMetadataSchema
]);

const gatewaySelectionFactsSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("selected"),
    selectedShapeIds: z.array(z.string().min(1).max(220)).min(1).max(2_000),
    source: gatewayFrontendRuntimeSourceMetadataSchema.optional()
  }),
  z.object({
    state: z.literal("empty"),
    selectedShapeIds: z.array(z.string().min(1).max(220)).max(0).default([]),
    source: gatewayFrontendRuntimeSourceMetadataSchema.optional()
  }),
  z.object({
    state: z.literal("none"),
    reason: z.string().min(1).max(500)
  })
]);

const gatewayViewportFactsSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("available"),
    pageBounds: boundsSchema,
    zoom: finiteNumberSchema.positive(),
    source: gatewayFrontendRuntimeSourceMetadataSchema.optional()
  }),
  z.object({
    state: z.literal("missing"),
    reason: z.string().min(1).max(500)
  })
]);

const gatewayChatBoundaryFactsSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("available"),
    messageLength: z.number().int().nonnegative().max(MAX_TEXT_LENGTH),
    source: gatewayContextSourceMetadataSchema
  }),
  z.object({
    state: z.literal("missing"),
    reason: z.string().min(1).max(500)
  })
]);

const gatewayCompletionTriggerSchema = z.object({
  kind: z.literal("completion"),
  invokedBy: z.literal("ai-drop"),
  selection: gatewaySelectionFactsSchema,
  viewport: gatewayViewportFactsSchema,
  source: roomContextSourceSchema
});

const gatewayConversationTriggerSchema = z.object({
  kind: z.literal("conversation"),
  message: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
  chatBoundary: gatewayChatBoundaryFactsSchema,
  source: gatewayConversationSourceIdentitySchema
});

export const gatewayTriggerSchema = z.discriminatedUnion("kind", [
  gatewayCompletionTriggerSchema,
  gatewayConversationTriggerSchema
]);

const gatewaySnapshotFactsSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("available"),
    snapshot: canvasSnapshotSchema,
    source: gatewayServerContextSourceMetadataSchema
  }),
  z.object({
    state: z.literal("missing"),
    reason: z.string().min(1).max(500),
    source: gatewayServerContextSourceMetadataSchema
  })
]);

const gatewayRecentOperationsFactsSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("available"),
    operations: z.array(roomOperationEventSchema).min(1).max(100),
    source: gatewayServerContextSourceMetadataSchema
  }),
  z.object({
    state: z.literal("missing"),
    operations: z.array(roomOperationEventSchema).max(0),
    reason: z.string().min(1).max(500),
    source: gatewayServerContextSourceMetadataSchema
  })
]);

export const gatewayFreshnessSchema = contextFreshnessSchema.extend({
  stale: z.boolean()
});

const gatewayMissingContextSchema = z.enum([
  "latest-snapshot",
  "recent-operations",
  "selection",
  "viewport",
  "chat-boundary"
]);

export const gatewayIntentReadinessSchema = z.object({
  state: z.enum(["ready", "stale", "incomplete"]),
  missing: z.array(gatewayMissingContextSchema),
  stale: z.boolean()
});

export const gatewayContextSchema = z.object({
  roomId: roomIdSchema,
  snapshot: gatewaySnapshotFactsSchema,
  recentOperations: gatewayRecentOperationsFactsSchema,
  freshness: gatewayFreshnessSchema,
  selectionFromSnapshot: z.object({
    selectedShapeIds: z.array(z.string().min(1).max(220)).max(2_000)
  }).optional(),
  viewportFromSnapshot: z.object({
    pageBounds: boundsSchema,
    zoom: finiteNumberSchema.positive()
  }).optional(),
  chatBoundary: gatewayChatBoundaryFactsSchema.optional(),
  intentReadiness: gatewayIntentReadinessSchema
});

export const gatewayRequestSchema = z
  .object({
    schemaVersion: z.literal(AI_GATEWAY_SCHEMA_VERSION),
    requestId: gatewayRequestIdSchema,
    roomId: roomIdSchema,
    createdAt: z.string().datetime(),
    trigger: gatewayTriggerSchema,
    context: gatewayContextSchema
  })
  .refine((request) => request.roomId === request.context.roomId, {
    message: "request roomId must match context roomId",
    path: ["context", "roomId"]
  });

export type GatewayContextSourceMetadata = z.infer<
  typeof gatewayContextSourceMetadataSchema
>;
export type GatewayTrigger = z.infer<typeof gatewayTriggerSchema>;
export type GatewayTriggerInput = z.input<typeof gatewayTriggerSchema>;
export type GatewayChatBoundaryFacts = z.infer<typeof gatewayChatBoundaryFactsSchema>;
export type GatewayFreshness = z.infer<typeof gatewayFreshnessSchema>;
export type GatewayContext = z.infer<typeof gatewayContextSchema>;
export type GatewayRequest = z.infer<typeof gatewayRequestSchema>;

export type CreateGatewayRequestInput = {
  requestId: string;
  roomId: string;
  createdAt: string;
  trigger: GatewayTriggerInput;
  context: RoomContextFeed;
  operationLimit?: number;
};

/**
 * 复制到 AI 输出中的 freshness 元数据，让 proposal 消费方能看到输出基于哪一版
 * 画布状态。
 */
export const agentOutputFreshnessSchema = contextFreshnessSchema.extend({
  stale: z.boolean()
});

const agentOutputBaseSchema = z.object({
  schemaVersion: z.literal(AGENT_OUTPUT_SCHEMA_VERSION),
  outputId: z.string().min(1).max(220),
  roomId: roomIdSchema,
  createdAt: z.string().datetime(),
  basedOn: agentOutputFreshnessSchema,
  nonMutating: z.literal(true)
});

/**
 * 非变更型文本建议。它不会修改画布，因此可以直接渲染。
 */
export const textSuggestionOutputSchema = agentOutputBaseSchema.extend({
  kind: z.literal("suggestion"),
  text: z.string().min(1).max(2_000)
});

/**
 * 对话入口的直接回答。它和 suggestion 分开，方便 gateway 诊断区分
 * “用户问了一个问题”与“agent 主动给出建议”。
 */
export const conversationAnswerOutputSchema = agentOutputBaseSchema.extend({
  kind: z.literal("conversation-answer"),
  text: z.string().min(1).max(2_000)
});

/**
 * 非变更型澄清问题。当 mate 需要更新上下文，或无法推断有效下一步时使用。
 */
export const questionOutputSchema = agentOutputBaseSchema.extend({
  kind: z.literal("question"),
  text: z.string().min(1).max(2_000)
});

/**
 * 明确的 no-op/refusal 输出。它表示 agent 判断当前不应该补全或行动，
 * 但仍然把拒绝原因作为可检查数据返回。
 */
export const noOpOutputSchema = agentOutputBaseSchema.extend({
  kind: z.literal("no-op"),
  reason: z.string().min(1).max(1_000)
});

const completionProposalStatusSchema = z.enum(["pending", "blocked", "invalid"]);

const textInElementCompletionSchema = z.object({
  kind: z.literal("text-in-element"),
  shapeId: z.string().min(1).max(220),
  currentText: z.string().max(MAX_TEXT_LENGTH),
  proposedText: z.string().trim().min(1).max(2_000)
});

const flowContinuationCompletionSchema = z.object({
  kind: z.literal("flow-continuation"),
  anchorShapeId: z.string().min(1).max(220),
  proposedNodes: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(500),
        type: z.string().min(1).max(80).optional()
      })
    )
    .min(1)
    .max(5),
  proposedConnectors: z
    .array(
      z.object({
        fromShapeId: z.string().min(1).max(220),
        toProposedNodeIndex: z.number().int().nonnegative()
      })
    )
    .max(5)
});

export const completionProposalOutputSchema = agentOutputBaseSchema.extend({
  kind: z.literal("completion-proposal"),
  proposal: z.object({
    proposalId: z.string().min(1).max(220),
    status: completionProposalStatusSchema,
    statusReason: z.string().min(1).max(1_000).optional(),
    previewOnly: z.literal(true),
    requiresAcceptance: z.literal(true),
    applied: z.literal(false),
    completion: z.discriminatedUnion("kind", [
      textInElementCompletionSchema,
      flowContinuationCompletionSchema
    ]),
    rationale: z.string().min(1).max(1_000)
  })
});

/**
 * 创建文本便签的纯数据画布动作。action 声明它会修改画布，但在未来显式 executor
 * 执行前，输出 envelope 仍然保持非变更。
 */
export const createTextNoteActionSchema = z.object({
  kind: z.literal("create-text-note"),
  mutatesCanvas: z.literal(true),
  text: z.string().trim().min(1).max(1_000),
  x: finiteNumberSchema.optional(),
  y: finiteNumberSchema.optional()
});

/**
 * mate 创建 action proposal 且 server 完成 freshness/safety 检查后的 proposal 状态。
 */
export const canvasActionProposalStatusSchema = z.enum([
  "pending",
  "blocked",
  "invalid"
]);

/**
 * 安全 action proposal envelope。proposal 始终需要用户确认，当前 server/web 流程
 * 永远不会自动应用它。
 */
export const canvasActionProposalOutputSchema = agentOutputBaseSchema.extend({
  kind: z.literal("canvas-action-proposal"),
  proposal: z.object({
    proposalId: z.string().min(1).max(220),
    status: canvasActionProposalStatusSchema,
    statusReason: z.string().min(1).max(1_000).optional(),
    requiresAcceptance: z.literal(true),
    action: createTextNoteActionSchema,
    rationale: z.string().min(1).max(1_000)
  })
});

/**
 * server 和 web 共同理解的完整 AI 输出协议。
 */
export const agentOutputSchema = z.discriminatedUnion("kind", [
  textSuggestionOutputSchema,
  conversationAnswerOutputSchema,
  questionOutputSchema,
  noOpOutputSchema,
  completionProposalOutputSchema,
  canvasActionProposalOutputSchema
]);

export type RoomContextSource = z.infer<typeof roomContextSourceSchema>;
export type CanvasShapeSnapshot = z.infer<typeof canvasShapeSnapshotSchema>;
export type CanvasSnapshot = z.infer<typeof canvasSnapshotSchema>;
export type CanvasChangeEvent = z.infer<typeof canvasChangeEventSchema>;
export type SelectionChangeEvent = z.infer<typeof selectionChangeEventSchema>;
export type ViewportChangeEvent = z.infer<typeof viewportChangeEventSchema>;
export type ChatBoundaryEvent = z.infer<typeof chatBoundaryEventSchema>;
export type RoomOperationEvent = z.infer<typeof roomOperationEventSchema>;
export type ContextFreshness = z.infer<typeof contextFreshnessSchema>;
export type RoomContextFeed = z.infer<typeof roomContextFeedSchema>;
export type AgentOutputFreshness = z.infer<typeof agentOutputFreshnessSchema>;
export type TextSuggestionOutput = z.infer<typeof textSuggestionOutputSchema>;
export type ConversationAnswerOutput = z.infer<typeof conversationAnswerOutputSchema>;
export type QuestionOutput = z.infer<typeof questionOutputSchema>;
export type NoOpOutput = z.infer<typeof noOpOutputSchema>;
export type CompletionProposalOutput = z.infer<
  typeof completionProposalOutputSchema
>;
export type CreateTextNoteAction = z.infer<typeof createTextNoteActionSchema>;
export type CanvasActionProposalOutput = z.infer<
  typeof canvasActionProposalOutputSchema
>;
export type AgentOutput = z.infer<typeof agentOutputSchema>;

export type CreateCanvasChangeEventInput = Omit<
  CanvasChangeEvent,
  "schemaVersion" | "kind"
>;

export type CreateSelectionChangeEventInput = Omit<
  SelectionChangeEvent,
  "schemaVersion" | "kind"
>;

export type CreateViewportChangeEventInput = Omit<
  ViewportChangeEvent,
  "schemaVersion" | "kind"
>;

export type CreateChatBoundaryEventInput = Omit<
  ChatBoundaryEvent,
  "schemaVersion" | "kind"
>;

/**
 * 使用当前 schema version 构造并校验 canvas-change event。
 */
export function createCanvasChangeEvent(
  input: CreateCanvasChangeEventInput
): CanvasChangeEvent {
  return canvasChangeEventSchema.parse({
    schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
    kind: "canvas-change",
    ...input
  });
}

/**
 * 使用当前 schema version 构造并校验 selection-change event。
 */
export function createSelectionChangeEvent(
  input: CreateSelectionChangeEventInput
): SelectionChangeEvent {
  return selectionChangeEventSchema.parse({
    schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
    kind: "selection-change",
    ...input
  });
}

/**
 * 使用当前 schema version 构造并校验 viewport-change event。
 */
export function createViewportChangeEvent(
  input: CreateViewportChangeEventInput
): ViewportChangeEvent {
  return viewportChangeEventSchema.parse({
    schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
    kind: "viewport-change",
    ...input
  });
}

/**
 * 使用当前 schema version 构造并校验 chat-boundary event。
 */
export function createChatBoundaryEvent(
  input: CreateChatBoundaryEventInput
): ChatBoundaryEvent {
  return chatBoundaryEventSchema.parse({
    schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
    kind: "chat-boundary",
    ...input
  });
}

/**
 * 为安静 room 创建显式空 feed，调用方不需要从 null 或 undefined server 状态中
 * 猜测上下文缺失。
 */
export function createEmptyRoomContextFeed(input: {
  roomId: string;
  agentSessionId?: string;
  generatedAt: string;
}): RoomContextFeed {
  return roomContextFeedSchema.parse({
    roomId: input.roomId,
    ...(input.agentSessionId ? { agentSessionId: input.agentSessionId } : {}),
    latestSnapshot: null,
    recentEvents: [],
    freshness: {
      snapshotVersion: 0,
      eventVersion: 0,
      changedSinceSnapshot: false
    },
    generatedAt: input.generatedAt
  });
}

/**
 * 从 server room context feed 构造 AI 网关请求。snapshot 和有界 recent operations
 * 被作为两个独立且共同必须的意图上下文输入暴露，避免下游只凭最新快照猜测用户意图。
 */
export function createGatewayRequest(
  input: CreateGatewayRequestInput
): GatewayRequest {
  const operationLimit = z.number().int().positive().max(100).default(25).parse(
    input.operationLimit
  );
  const operations = input.context.recentEvents.slice(-operationLimit);
  const serverSourceBase = {
    origin: "server-context-feed" as const,
    feedGeneratedAt: input.context.generatedAt
  };
  const snapshot = input.context.latestSnapshot
    ? {
        state: "available" as const,
        snapshot: input.context.latestSnapshot,
        source: {
          ...serverSourceBase,
          source: input.context.latestSnapshot.source
        }
      }
    : {
        state: "missing" as const,
        reason: "No latest snapshot exists in the server room context feed.",
        source: serverSourceBase
      };
  const recentOperations =
    operations.length > 0
      ? {
          state: "available" as const,
          operations,
          source: {
            ...serverSourceBase,
            boundedTo: operationLimit,
            eventCountBeforeBounding: input.context.recentEvents.length
          }
        }
      : {
          state: "missing" as const,
          operations: [],
          reason: "No recent operations exist in the server room context feed.",
          source: {
            ...serverSourceBase,
            boundedTo: operationLimit,
            eventCountBeforeBounding: input.context.recentEvents.length
          }
        };
  const freshness = {
    ...input.context.freshness,
    stale: input.context.freshness.changedSinceSnapshot
  };
  const chatBoundary = buildGatewayChatBoundary(input.trigger, operations);
  const missing = buildMissingContextList({
    trigger: input.trigger,
    snapshotState: snapshot.state,
    recentOperationsState: recentOperations.state,
    ...(chatBoundary ? { chatBoundary } : {})
  });

  return gatewayRequestSchema.parse({
    schemaVersion: AI_GATEWAY_SCHEMA_VERSION,
    requestId: input.requestId,
    roomId: input.roomId,
    createdAt: input.createdAt,
    trigger:
      input.trigger.kind === "conversation"
        ? { ...input.trigger, chatBoundary }
        : input.trigger,
    context: {
      roomId: input.context.roomId,
      snapshot,
      recentOperations,
      freshness,
      ...(input.context.latestSnapshot
        ? {
            selectionFromSnapshot: input.context.latestSnapshot.selection,
            viewportFromSnapshot: input.context.latestSnapshot.viewport
          }
        : {}),
      ...(chatBoundary ? { chatBoundary } : {}),
      intentReadiness: {
        state:
          missing.length > 0 ? "incomplete" : freshness.stale ? "stale" : "ready",
        missing,
        stale: freshness.stale
      }
    }
  });
}

/**
 * conversation trigger 优先使用 server feed 中的 chat-boundary event；只有 server
 * 尚未收到边界事件时，才保留调用方提供的前端补充信号或显式 missing 状态。
 */
function buildGatewayChatBoundary(
  trigger: GatewayTriggerInput,
  operations: RoomOperationEvent[]
): GatewayChatBoundaryFacts | undefined {
  if (trigger.kind !== "conversation") {
    return undefined;
  }

  const event = [...operations].reverse().find(
    (operation): operation is ChatBoundaryEvent => operation.kind === "chat-boundary"
  );
  if (event) {
    return {
      state: "available",
      messageLength: event.messageLength,
      source: {
        origin: "server-context-feed",
        eventId: event.eventId,
        eventVersion: event.eventVersion,
        source: event.source
      }
    };
  }

  return trigger.chatBoundary;
}

function buildMissingContextList(input: {
  trigger: GatewayTriggerInput;
  snapshotState: "available" | "missing";
  recentOperationsState: "available" | "missing";
  chatBoundary?: GatewayChatBoundaryFacts;
}): Array<z.infer<typeof gatewayMissingContextSchema>> {
  const missing: Array<z.infer<typeof gatewayMissingContextSchema>> = [];
  if (input.snapshotState === "missing") {
    missing.push("latest-snapshot");
  }
  if (input.recentOperationsState === "missing") {
    missing.push("recent-operations");
  }
  if (input.trigger.kind === "completion") {
    if (input.trigger.selection.state === "none") {
      missing.push("selection");
    }
    if (input.trigger.viewport.state === "missing") {
      missing.push("viewport");
    }
  }
  if (
    input.trigger.kind === "conversation" &&
    input.chatBoundary?.state === "missing"
  ) {
    missing.push("chat-boundary");
  }
  return missing;
}
