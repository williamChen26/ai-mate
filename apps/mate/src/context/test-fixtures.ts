import {
  CANVAS_CONTEXT_SCHEMA_VERSION,
  roomContextFeedSchema,
  type RoomContextFeed,
  type RoomOperationEvent
} from "@production-spec-graph/shared";

export type FixtureEventKind = RoomOperationEvent["kind"];

export function makeRoomContextFeed({
  roomId = "room-fixture",
  shapeTexts = ["Launch plan"],
  shapeTypes,
  eventKinds = ["canvas-change"],
  eventSummaries,
  changedSinceSnapshot = false
}: {
  roomId?: string;
  shapeTexts?: string[];
  shapeTypes?: string[];
  eventKinds?: FixtureEventKind[];
  eventSummaries?: string[];
  changedSinceSnapshot?: boolean;
} = {}): RoomContextFeed {
  const capturedAt = "2026-06-03T00:00:00.000Z";
  const eventVersion = changedSinceSnapshot ? 2 : eventKinds.length;
  const snapshotVersion = shapeTexts.length > 0 ? 1 : 0;
  const eventVersionAtSnapshot = changedSinceSnapshot ? 1 : eventVersion;

  return roomContextFeedSchema.parse({
    roomId,
    agentSessionId: `agent:${roomId}`,
    latestSnapshot: {
      schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
      roomId,
      source: {
        kind: "web",
        deviceId: "device-fixture",
        sessionId: "session-fixture",
        tabId: "tab-fixture",
        capturedAt
      },
      document: {
        shapeCount: shapeTexts.length,
        shapes: shapeTexts.map((text, index) => ({
          id: `shape:${index + 1}`,
          type: shapeTypes?.[index] ?? "text",
          text,
          bounds: {
            x: 20 + index * 10,
            y: 30 + index * 10,
            w: 160,
            h: 48
          }
        }))
      },
      selection: {
        selectedShapeIds: shapeTexts.length > 0 ? ["shape:1"] : []
      },
      viewport: {
        pageBounds: {
          x: 0,
          y: 0,
          w: 1200,
          h: 800
        },
        zoom: 1
      },
      freshness: {
        snapshotVersion,
        eventVersionAtSnapshot
      }
    },
    recentEvents: eventKinds.map((kind, index) =>
      makeOperationEvent({
        roomId,
        kind,
        eventVersion: index + 1,
        summary: eventSummaries?.[index]
      })
    ),
    freshness: {
      snapshotVersion,
      eventVersion,
      changedSinceSnapshot
    },
    generatedAt: "2026-06-03T00:00:03.000Z"
  });
}

function makeOperationEvent({
  roomId,
  kind,
  eventVersion,
  summary
}: {
  roomId: string;
  kind: FixtureEventKind;
  eventVersion: number;
  summary?: string;
}): RoomOperationEvent {
  const base = {
    schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION as typeof CANVAS_CONTEXT_SCHEMA_VERSION,
    roomId,
    eventId: `event:${eventVersion}`,
    eventVersion,
    source: {
      kind: "web" as const,
      deviceId: "device-fixture",
      sessionId: "session-fixture",
      tabId: "tab-fixture",
      capturedAt: "2026-06-03T00:00:01.000Z"
    },
    occurredAt: "2026-06-03T00:00:02.000Z"
  };

  if (kind === "canvas-change") {
    return {
      ...base,
      kind,
      affectedShapeIds: ["shape:1"],
      summary: summary ?? "fixture canvas change"
    };
  }
  if (kind === "selection-change") {
    return {
      ...base,
      kind,
      selectedShapeIds: ["shape:1"]
    };
  }
  if (kind === "viewport-change") {
    return {
      ...base,
      kind,
      pageBounds: {
        x: 0,
        y: 0,
        w: 1200,
        h: 800
      },
      zoom: 1
    };
  }
  return {
    ...base,
    kind,
    messageLength: 24
  };
}
