import { z } from "zod";

/**
 * web 生成、server/mate 消费的画布上下文 payload 版本标识。
 */
export const CANVAS_CONTEXT_SCHEMA_VERSION = "canvas-context.v1";

/**
 * mate 返回、server 校验、web 渲染或未来执行前使用的 AI 输出版本标识。
 */
export const AGENT_OUTPUT_SCHEMA_VERSION = "agent-output.v1";

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
 * 非变更型澄清问题。当 mate 需要更新上下文，或无法推断有效下一步时使用。
 */
export const questionOutputSchema = agentOutputBaseSchema.extend({
  kind: z.literal("question"),
  text: z.string().min(1).max(2_000)
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
  questionOutputSchema,
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
export type QuestionOutput = z.infer<typeof questionOutputSchema>;
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
