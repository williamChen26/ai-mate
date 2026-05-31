/**
 * Tldraw 智能体动作适配器。
 *
 * 这个模块实现 `agent-actions.ts` 定义的命令模式适配器侧：
 * 验证/试运行保持纯逻辑，而这里是已验证计划可以修改实时 tldraw `Editor`
 * 的唯一位置。保持这个边界很薄，可以让未来审计 AI 驱动编辑更简单。
 */
import type { Editor, TLShapeId } from "tldraw";

import {
  validateAgentActionPlan,
  type AgentActionApplyResult,
  type AgentActionPlan
} from "./agent-actions";
import type { CanvasContext } from "./canvas-context";

export type { AgentActionApplyResult };

type TldrawShapePartial = {
  id: TLShapeId;
  type: string;
  x?: number;
  y?: number;
  props?: Record<string, unknown>;
};

/**
 * 将一个已验证过的动作计划显式应用到已挂载的 tldraw 编辑器。
 * 函数仍然会在边界再次验证，因为控制台调用方和未来 AI 集成都可能直接向 `apply`
 * 传入任意数据。
 */
export function applyAgentActionPlanToEditor(
  editor: Editor,
  plan: unknown,
  context: CanvasContext
): AgentActionApplyResult {
  const validation = validateAgentActionPlan(plan, context);
  if (!validation.ok) {
    return {
      ok: false,
      status: "refused",
      errors: validation.errors,
      appliedActions: [],
      ...(validation.expectedImpact
        ? { expectedImpact: validation.expectedImpact }
        : {})
    };
  }

  const typedPlan = plan as AgentActionPlan;
  const appliedActions: AgentActionApplyResult["appliedActions"] = [];

  try {
    for (const action of typedPlan.actions) {
      switch (action.kind) {
        case "createText":
          editor.createShape({
            id: action.id as TLShapeId,
            type: "text",
            x: action.x,
            y: action.y,
            props: { richText: toSimpleRichText(action.text) }
          } as TldrawShapePartial);
          appliedActions.push({
            kind: action.kind,
            targets: [],
            created: [action.id]
          });
          break;
        case "createGeoRectangle":
          editor.createShape({
            id: action.id as TLShapeId,
            type: "geo",
            x: action.x,
            y: action.y,
            props: {
              geo: "rectangle",
              w: action.width,
              h: action.height,
              ...(action.text
                ? { richText: toSimpleRichText(action.text) }
                : {})
            }
          } as TldrawShapePartial);
          appliedActions.push({
            kind: action.kind,
            targets: [],
            created: [action.id]
          });
          break;
        case "moveShape": {
          const shape = editor.getShape(action.id as TLShapeId);
          editor.updateShape({
            id: action.id as TLShapeId,
            type: shape?.type ?? "geo",
            x: action.x,
            y: action.y
          } as TldrawShapePartial);
          appliedActions.push({
            kind: action.kind,
            targets: [action.id],
            created: []
          });
          break;
        }
        case "updateText": {
          const shape = editor.getShape(action.id as TLShapeId);
          editor.updateShape({
            id: action.id as TLShapeId,
            type: shape?.type ?? "text",
            props: { richText: toSimpleRichText(action.text) }
          } as TldrawShapePartial);
          appliedActions.push({
            kind: action.kind,
            targets: [action.id],
            created: []
          });
          break;
        }
        case "deleteShapes":
          editor.deleteShapes(action.ids as TLShapeId[]);
          appliedActions.push({
            kind: action.kind,
            targets: [...action.ids],
            created: [],
            deleted: [...action.ids]
          });
          break;
        case "selectShapes":
          editor.setSelectedShapes(action.ids as TLShapeId[]);
          if (action.focus) {
            editor.zoomToSelectionIfOffscreen();
          }
          appliedActions.push({
            kind: action.kind,
            targets: [...action.ids],
            created: []
          });
          break;
      }
    }

    return {
      ok: true,
      status: "applied",
      errors: [],
      appliedActions,
      ...(validation.expectedImpact
        ? { expectedImpact: validation.expectedImpact }
        : {})
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      errors: [
        {
          code: "APPLY_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Unknown tldraw apply failure."
        }
      ],
      appliedActions,
      ...(validation.expectedImpact
        ? { expectedImpact: validation.expectedImpact }
        : {})
    };
  }
}

/**
 * 将纯文本转换成 tldraw text/geo 图形属性需要的最小富文本树。
 * 这样公开动作契约可以保持简单，而 tldraw 专属富文本细节由适配器负责。
 */
function toSimpleRichText(text: string) {
  return {
    type: "doc",
    content: text.split("\n").map((line) =>
      line.length > 0
        ? {
            type: "paragraph",
            content: [{ type: "text", text: line }]
          }
        : { type: "paragraph" }
    )
  };
}
