/**
 * 纯画布上下文构建器的单元测试。它们记录未来 AI 提示词代码和
 * 动作规划都依赖的 JSON 安全契约。
 */
import { describe, expect, it } from "vitest";

import {
  buildCanvasContext,
  type CanvasContextInput
} from "./canvas-context";

const baseInput: CanvasContextInput = {
  shapes: [],
  selectedShapeIds: [],
  viewport: {
    camera: { x: 0, y: 0, z: 1 },
    pageBounds: { x: -400, y: -300, width: 800, height: 600 }
  },
  recentChanges: {
    scope: "local-session",
    observedChangeCount: 0,
    affectedRecordIds: [],
    affectedShapeIds: []
  }
};

describe("buildCanvasContext", () => {
  it("builds a JSON-serializable empty tldraw context with required agent constraints", () => {
    const context = buildCanvasContext(baseInput);

    expect(context.source.kind).toBe("tldraw");
    expect(context.document.shapeCount).toBe(0);
    expect(context.document.shapeTypes).toEqual({});
    expect(context.shapes).toEqual([]);
    expect(context.selection.shapeIds).toEqual([]);
    expect(context.selection.count).toBe(0);
    expect(context.recentChanges.hasObservedChanges).toBe(false);
    expect(context.futureAgentConstraints.unsupportedAssumptions).toEqual(
      expect.arrayContaining([
        "no-ai-model-calls",
        "no-chat-ui",
        "no-autonomous-edits",
        "no-real-collaboration",
        "no-custom-flowchart-protocol-authority"
      ])
    );

    expect(() => JSON.stringify(context)).not.toThrow();
    expect(JSON.parse(JSON.stringify(context))).toEqual(context);
  });

  it("summarizes populated shapes, active selection, viewport, and local recent changes", () => {
    const input: CanvasContextInput = {
      ...baseInput,
      shapes: [
        {
          id: "shape:box",
          type: "geo",
          parentId: "page:page",
          x: 10,
          y: 20,
          rotation: 0,
          props: { w: 160, h: 90, text: "Checkout" },
          bounds: { x: 10, y: 20, width: 160, height: 90 }
        },
        {
          id: "shape:note",
          type: "text",
          parentId: "page:page",
          x: 240,
          y: 40,
          rotation: 0,
          props: { text: "Clarify payment states" },
          bounds: { x: 240, y: 40, width: 220, height: 48 }
        }
      ],
      selectedShapeIds: ["shape:note"],
      viewport: {
        camera: { x: 125, y: -50, z: 1.5 },
        pageBounds: { x: -125, y: -150, width: 900, height: 700 }
      },
      recentChanges: {
        scope: "local-session",
        observedChangeCount: 3,
        affectedRecordIds: ["shape:box", "instance_page_state:page"],
        affectedShapeIds: ["shape:box"],
        lastChangeSource: "user"
      }
    };

    const context = buildCanvasContext(input);

    expect(context.document.shapeCount).toBe(2);
    expect(context.document.shapeTypes).toEqual({ geo: 1, text: 1 });
    expect(context.document.selectedShapeCount).toBe(1);
    expect(context.shapes).toEqual([
      expect.objectContaining({
        id: "shape:box",
        type: "geo",
        text: "Checkout"
      }),
      expect.objectContaining({
        id: "shape:note",
        type: "text",
        text: "Clarify payment states"
      })
    ]);
    expect(context.selection).toEqual({
      count: 1,
      shapeIds: ["shape:note"]
    });
    expect(context.viewport.camera).toEqual({ x: 125, y: -50, z: 1.5 });
    expect(context.viewport.pageBounds).toEqual({
      x: -125,
      y: -150,
      width: 900,
      height: 700
    });
    expect(context.recentChanges).toEqual({
      scope: "local-session",
      hasObservedChanges: true,
      observedChangeCount: 3,
      affectedRecordIds: ["shape:box", "instance_page_state:page"],
      affectedShapeIds: ["shape:box"],
      lastChangeSource: "user",
      note: "Local/session bookkeeping only; not AI interpretation or collaboration history."
    });
  });

  it("changes only the relevant context fields when deterministic inputs change", () => {
    const oneShape = buildCanvasContext({
      ...baseInput,
      shapes: [
        {
          id: "shape:a",
          type: "geo",
          x: 0,
          y: 0,
          props: { w: 100, h: 100 },
          bounds: { x: 0, y: 0, width: 100, height: 100 }
        }
      ]
    });
    const selected = buildCanvasContext({
      ...baseInput,
      selectedShapeIds: ["shape:a"]
    });
    const movedViewport = buildCanvasContext({
      ...baseInput,
      viewport: {
        camera: { x: 50, y: 25, z: 2 },
        pageBounds: { x: 50, y: 25, width: 400, height: 300 }
      }
    });
    const changed = buildCanvasContext({
      ...baseInput,
      recentChanges: {
        scope: "local-session",
        observedChangeCount: 1,
        affectedRecordIds: ["shape:a"],
        affectedShapeIds: ["shape:a"]
      }
    });

    expect(oneShape.document.shapeCount).toBe(1);
    expect(selected.selection.shapeIds).toEqual(["shape:a"]);
    expect(movedViewport.viewport.camera).toEqual({ x: 50, y: 25, z: 2 });
    expect(changed.recentChanges.hasObservedChanges).toBe(true);

    expect(oneShape.futureAgentConstraints).toEqual(
      selected.futureAgentConstraints
    );
    expect(selected.futureAgentConstraints).toEqual(
      movedViewport.futureAgentConstraints
    );
    expect(movedViewport.futureAgentConstraints).toEqual(
      changed.futureAgentConstraints
    );
  });
});
