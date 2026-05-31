import type { Editor, TLShape, TLStoreEventInfo } from "tldraw";

import {
  buildCanvasContext,
  type CanvasBounds,
  type CanvasContext,
  type CanvasShapeInput,
  type RecentCanvasChangeSummaryInput
} from "./canvas-context";

/**
 * 这个模块是纯画布上下文构建器的 tldraw 适配器。
 * 它是唯一读取实时 `Editor` API 的上下文抽取文件；所有返回内容都会先归一化为
 * 普通数据，再跨入模型层。
 */

/**
 * 读取已挂载的 tldraw 编辑器，并返回当前智能体可读上下文。
 * 函数使用公开编辑器 API 获取图形、选择、相机、视口边界和页面边界，
 * 然后把所有 JSON 形态规则交给 `buildCanvasContext`。
 */
export function buildCanvasContextFromEditor(
  editor: Editor,
  recentChanges: RecentCanvasChangeSummaryInput
): CanvasContext {
  const shapes = editor.getCurrentPageShapes().map((shape) =>
    normalizeShape(editor, shape)
  );
  const viewportPageBounds = editor.getViewportPageBounds();
  const documentBounds = editor.getCurrentPageBounds();

  return buildCanvasContext({
    shapes,
    selectedShapeIds: editor.getSelectedShapeIds(),
    viewport: {
      camera: normalizeCamera(editor.getCamera()),
      pageBounds: normalizeBounds(viewportPageBounds)
    },
    ...(documentBounds
      ? { documentBounds: normalizeBounds(documentBounds) }
      : {}),
    recentChanges
  });
}

/**
 * 将 tldraw store history event 转成排序后的 record ids。
 * 近期变更追踪器只消费 id，因此可以独立于 tldraw 内部 diff 对象结构。
 */
export function getChangedRecordIdsFromStoreEvent(
  entry: TLStoreEventInfo
): string[] {
  return [
    ...Object.keys(entry.changes.added),
    ...Object.keys(entry.changes.updated),
    ...Object.keys(entry.changes.removed)
  ].sort();
}

/**
 * 将一个实时 tldraw 图形归一化到上下文输入契约。
 * 边界通过编辑器计算，因为图形局部属性不一定等于页面空间边界。
 */
function normalizeShape(editor: Editor, shape: TLShape): CanvasShapeInput {
  const bounds = editor.getShapePageBounds(shape);

  return {
    id: shape.id,
    type: shape.type,
    parentId: shape.parentId,
    x: shape.x,
    y: shape.y,
    rotation: shape.rotation,
    props: shape.props,
    ...(bounds ? { bounds: normalizeBounds(bounds) } : {})
  };
}

/**
 * 将 tldraw 相机复制成普通对象。这个适配器步骤防止实时编辑器对象泄漏到
 * 序列化后的上下文中。
 */
function normalizeCamera(camera: { x: number; y: number; z: number }) {
  return {
    x: camera.x,
    y: camera.y,
    z: camera.z
  };
}

/**
 * 将 tldraw `Box` 风格的 (`w`/`h`) bounds 和类 DOM 的 (`width`/`height`) bounds
 * 统一归一化到稳定的 `CanvasBounds` 契约。
 */
function normalizeBounds(bounds: {
  x: number;
  y: number;
  width?: number;
  height?: number;
  w?: number;
  h?: number;
}): CanvasBounds {
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width ?? bounds.w ?? 0,
    height: bounds.height ?? bounds.h ?? 0
  };
}
