import { z } from "zod";

export const CANVAS_CONTEXT_SCHEMA_VERSION = "canvas-context.v1";
export const AGENT_OUTPUT_SCHEMA_VERSION = "agent-output.v1";

const ROOM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_ROOM_ID_LENGTH = 80;
const MAX_TEXT_LENGTH = 8_000;

const finiteNumberSchema = z.number().finite();

export const roomIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_ROOM_ID_LENGTH)
  .regex(ROOM_ID_PATTERN);

export const boundsSchema = z.object({
  x: finiteNumberSchema,
  y: finiteNumberSchema,
  w: finiteNumberSchema.nonnegative(),
  h: finiteNumberSchema.nonnegative()
});

export const roomContextSourceSchema = z.object({
  kind: z.literal("web"),
  deviceId: z.string().min(1).max(160),
  sessionId: z.string().min(1).max(220),
  tabId: z.string().min(1).max(160),
  capturedAt: z.string().datetime()
});

export const canvasShapeSnapshotSchema = z.object({
  id: z.string().min(1).max(220),
  type: z.string().min(1).max(80),
  text: z.string().max(MAX_TEXT_LENGTH).nullable().optional(),
  bounds: boundsSchema.optional()
});

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

export const canvasChangeEventSchema = eventBaseSchema.extend({
  kind: z.literal("canvas-change"),
  affectedShapeIds: z.array(z.string().min(1).max(220)).max(2_000),
  summary: z.string().min(1).max(1_000)
});

export const selectionChangeEventSchema = eventBaseSchema.extend({
  kind: z.literal("selection-change"),
  selectedShapeIds: z.array(z.string().min(1).max(220)).max(2_000)
});

export const viewportChangeEventSchema = eventBaseSchema.extend({
  kind: z.literal("viewport-change"),
  pageBounds: boundsSchema,
  zoom: finiteNumberSchema.positive()
});

export const chatBoundaryEventSchema = eventBaseSchema.extend({
  kind: z.literal("chat-boundary"),
  messageLength: z.number().int().nonnegative().max(MAX_TEXT_LENGTH)
});

export const roomOperationEventSchema = z.discriminatedUnion("kind", [
  canvasChangeEventSchema,
  selectionChangeEventSchema,
  viewportChangeEventSchema,
  chatBoundaryEventSchema
]);

export const contextFreshnessSchema = z.object({
  snapshotVersion: z.number().int().nonnegative(),
  eventVersion: z.number().int().nonnegative(),
  changedSinceSnapshot: z.boolean()
});

export const roomContextFeedSchema = z.object({
  roomId: roomIdSchema,
  agentSessionId: z.string().min(1).max(220).optional(),
  latestSnapshot: canvasSnapshotSchema.nullable(),
  recentEvents: z.array(roomOperationEventSchema).max(2_000),
  freshness: contextFreshnessSchema,
  generatedAt: z.string().datetime()
});

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

export const textSuggestionOutputSchema = agentOutputBaseSchema.extend({
  kind: z.literal("suggestion"),
  text: z.string().min(1).max(2_000)
});

export const questionOutputSchema = agentOutputBaseSchema.extend({
  kind: z.literal("question"),
  text: z.string().min(1).max(2_000)
});

export const createTextNoteActionSchema = z.object({
  kind: z.literal("create-text-note"),
  mutatesCanvas: z.literal(true),
  text: z.string().trim().min(1).max(1_000),
  x: finiteNumberSchema.optional(),
  y: finiteNumberSchema.optional()
});

export const canvasActionProposalStatusSchema = z.enum([
  "pending",
  "blocked",
  "invalid"
]);

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

export function createCanvasChangeEvent(
  input: CreateCanvasChangeEventInput
): CanvasChangeEvent {
  return canvasChangeEventSchema.parse({
    schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
    kind: "canvas-change",
    ...input
  });
}

export function createSelectionChangeEvent(
  input: CreateSelectionChangeEventInput
): SelectionChangeEvent {
  return selectionChangeEventSchema.parse({
    schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
    kind: "selection-change",
    ...input
  });
}

export function createViewportChangeEvent(
  input: CreateViewportChangeEventInput
): ViewportChangeEvent {
  return viewportChangeEventSchema.parse({
    schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
    kind: "viewport-change",
    ...input
  });
}

export function createChatBoundaryEvent(
  input: CreateChatBoundaryEventInput
): ChatBoundaryEvent {
  return chatBoundaryEventSchema.parse({
    schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
    kind: "chat-boundary",
    ...input
  });
}

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
