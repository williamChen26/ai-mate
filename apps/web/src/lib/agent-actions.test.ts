/**
 * 纯动作规划边界的单元测试。测试把这个模块当成 AI 输出防火墙：
 * 未知输入进入后，只有经过验证、可序列化、不会产生修改的结果能出来；
 * 显式应用则由其他边界处理。
 */
import { describe, expect, it } from "vitest";

import {
  buildCanvasContext,
  type CanvasContext
} from "./canvas-context";
import {
  createContextReference,
  dryRunAgentActionPlan,
  validateAgentActionPlan
} from "./agent-actions";

/**
 * 为动作边界测试构建一个有代表性的 Sprint 4 上下文夹具。
 * 夹具同时包含文本和几何图形，以及近期变更标记，
 * 这样验证可以覆盖受支持动作和过期目标拒绝。
 */
function makeContext(overrides: Partial<CanvasContext> = {}): CanvasContext {
  const context = buildCanvasContext({
    shapes: [
      {
        id: "shape:text",
        type: "text",
        x: 10,
        y: 20,
        props: { richText: { type: "doc", content: [{ text: "Old text" }] } },
        bounds: { x: 10, y: 20, width: 160, height: 48 }
      },
      {
        id: "shape:geo",
        type: "geo",
        x: 240,
        y: 80,
        props: {
          w: 160,
          h: 90,
          richText: { type: "doc", content: [{ text: "Step" }] }
        },
        bounds: { x: 240, y: 80, width: 160, height: 90 }
      }
    ],
    selectedShapeIds: ["shape:text"],
    viewport: {
      camera: { x: 0, y: 0, z: 1 },
      pageBounds: { x: -400, y: -300, width: 800, height: 600 }
    },
    recentChanges: {
      scope: "local-session",
      observedChangeCount: 3,
      affectedRecordIds: ["shape:geo"],
      affectedShapeIds: ["shape:geo"]
    }
  });

  return {
    ...context,
    ...overrides
  };
}

describe("agent action planning", () => {
  it("validates the focused supported action set against a tldraw context", () => {
    const context = makeContext();
    const ref = createContextReference(context);

    const plans = [
      {
        planId: "plan:create-text",
        context: ref,
        actions: [
          {
            kind: "createText",
            id: "shape:new-text",
            text: "Clarify empty state",
            x: 120,
            y: 80
          }
        ]
      },
      {
        planId: "plan:create-geo",
        context: ref,
        actions: [
          {
            kind: "createGeoRectangle",
            id: "shape:new-geo",
            text: "Payment pending",
            x: 220,
            y: 140,
            width: 180,
            height: 100
          }
        ]
      },
      {
        planId: "plan:move",
        context: ref,
        actions: [
          {
            kind: "moveShape",
            id: "shape:text",
            x: 300,
            y: 320
          }
        ]
      },
      {
        planId: "plan:update-text",
        context: ref,
        actions: [
          {
            kind: "updateText",
            id: "shape:text",
            text: "Updated by explicit apply"
          }
        ]
      },
      {
        planId: "plan:delete",
        context: ref,
        actions: [
          {
            kind: "deleteShapes",
            ids: ["shape:text"]
          }
        ]
      },
      {
        planId: "plan:select",
        context: ref,
        actions: [
          {
            kind: "selectShapes",
            ids: ["shape:text", "shape:geo"],
            focus: true
          }
        ]
      }
    ];

    for (const plan of plans) {
      const result = validateAgentActionPlan(plan, context);
      expect(result.ok, plan.planId).toBe(true);
    }

    expect(validateAgentActionPlan(plans[3], context)).toMatchObject({
      ok: true,
      errors: [],
      expectedImpact: {
        actions: [expect.objectContaining({ kind: "updateText" })]
      }
    });
    expect(validateAgentActionPlan({
      planId: "plan:update-geo",
      context: ref,
      actions: [
        {
          kind: "updateText",
          id: "shape:geo",
          text: "Geo text is supported too"
        }
      ]
    }, context)).toMatchObject({ ok: true });
  });

  it("rejects malformed, unsupported, stale, missing-target, oversized, and unsafe plans without mutating inputs", () => {
    const context = makeContext();
    const beforeContext = JSON.stringify(context);
    const ref = createContextReference(context);

    const invalidPlans = [
      {
        context: ref,
        actions: [{ kind: "unsupported" }]
      },
      {
        context: ref,
        actions: [
          {
            kind: "createText",
            id: "shape:new-text",
            text: "x".repeat(2_001),
            x: 0,
            y: 0
          }
        ]
      },
      {
        context: ref,
        actions: [
          {
            kind: "createGeoRectangle",
            id: "shape:text",
            text: "duplicate",
            x: 0,
            y: 0,
            width: 100,
            height: 80
          }
        ]
      },
      {
        context: ref,
        actions: [
          {
            kind: "moveShape",
            id: "shape:text",
            x: Number.NaN,
            y: 20
          }
        ]
      },
      {
        context: ref,
        actions: [
          {
            kind: "deleteShapes",
            ids: ["shape:missing"]
          }
        ]
      },
      {
        context: {
          ...ref,
          observedChangeCount: ref.observedChangeCount - 1
        },
        actions: [
          {
            kind: "moveShape",
            id: "shape:text",
            x: 20,
            y: 20
          }
        ]
      },
      {
        context: ref,
        actions: [
          {
            kind: "selectShapes",
            ids: []
          }
        ]
      }
    ];

    for (const plan of invalidPlans) {
      const result = validateAgentActionPlan(plan, context);
      expect(result.ok).toBe(false);
      expect(() => JSON.stringify(result)).not.toThrow();
      expect(result).toHaveProperty("errors");
    }

    expect(JSON.stringify(context)).toBe(beforeContext);
  });

  it("dry-runs supported plans with serializable expected impact and no context mutation", () => {
    const context = makeContext();
    const beforeContext = JSON.stringify(context);
    const plan = {
      planId: "plan:move",
      context: createContextReference(context),
      actions: [
        {
          kind: "moveShape",
          id: "shape:text",
          x: 400,
          y: 240
        }
      ]
    };

    const result = dryRunAgentActionPlan(plan, context);

    expect(result).toMatchObject({
      ok: true,
      mode: "dry-run",
      expectedImpact: {
        actions: [
          expect.objectContaining({
            kind: "moveShape",
            targets: ["shape:text"]
          })
        ]
      },
      errors: []
    });
    expect(result.expectedImpact?.safetyNotes).toContain(
      "Only an explicit apply call may mutate the mounted editor."
    );
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(JSON.stringify(context)).toBe(beforeContext);
  });

  it("detects context source mismatch and recently affected target staleness", () => {
    const context = makeContext();
    const cleanRef = createContextReference(context);
    const staleSource = validateAgentActionPlan(
      {
        context: {
          ...cleanRef,
          source: {
            ...cleanRef.source,
            adapter: "other-adapter"
          }
        },
        actions: [
          {
            kind: "moveShape",
            id: "shape:text",
            x: 50,
            y: 60
          }
        ]
      },
      context
    );
    const recentlyAffected = validateAgentActionPlan(
      {
        context: {
          ...createContextReference(context),
          affectedShapeIds: []
        },
        actions: [
          {
            kind: "moveShape",
            id: "shape:geo",
            x: 50,
            y: 60
          }
        ]
      },
      context
    );

    expect(staleSource).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: "STALE_SOURCE_ADAPTER" })]
    });
    expect(recentlyAffected).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: "RECENT_TARGET_CHANGED" })]
    });
  });
});
