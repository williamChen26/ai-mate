/**
 * 智能体动作规划是未来 AI 计划和实时 tldraw 编辑器之间的纯安全边界。
 * 这里采用命令验证流水线架构：
 * 1. 调用方提供批量 `AgentActionPlan` 和 Sprint 4 上下文引用；
 * 2. 验证器用 JSON 安全错误拒绝格式错误、过期或不安全的命令；
 * 3. 试运行在不触碰编辑器的情况下返回预期影响；
 * 4. 独立适配器模块只在验证之后执行显式修改。
 *
 * 这个模块刻意不导入 React，也不导入实时 tldraw `Editor`；这种分离让验证
 * 保持确定性，并适用于测试、日志和未来 AI 输出检查。
 */
import type { CanvasContext, CanvasShapeInventoryItem } from "./canvas-context";

export type AgentActionContextReference = {
  schemaVersion: CanvasContext["schemaVersion"];
  source: {
    adapter: CanvasContext["source"]["adapter"];
    sourceOfTruth: CanvasContext["source"]["sourceOfTruth"];
  };
  observedChangeCount: number;
  shapeIds: string[];
  affectedShapeIds: string[];
};

export type CreateTextAction = {
  kind: "createText";
  id: string;
  text: string;
  x: number;
  y: number;
};

export type CreateGeoRectangleAction = {
  kind: "createGeoRectangle";
  id: string;
  text?: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MoveShapeAction = {
  kind: "moveShape";
  id: string;
  x: number;
  y: number;
};

export type UpdateTextAction = {
  kind: "updateText";
  id: string;
  text: string;
};

export type DeleteShapesAction = {
  kind: "deleteShapes";
  ids: string[];
};

export type SelectShapesAction = {
  kind: "selectShapes";
  ids: string[];
  focus?: boolean;
};

export type AgentAction =
  | CreateTextAction
  | CreateGeoRectangleAction
  | MoveShapeAction
  | UpdateTextAction
  | DeleteShapesAction
  | SelectShapesAction;

export type AgentActionPlan = {
  planId?: string;
  context: AgentActionContextReference;
  actions: AgentAction[];
};

export type AgentActionErrorCode =
  | "PLAN_NOT_OBJECT"
  | "CONTEXT_REFERENCE_REQUIRED"
  | "ACTIONS_REQUIRED"
  | "ACTION_NOT_OBJECT"
  | "UNSUPPORTED_ACTION_KIND"
  | "ID_REQUIRED"
  | "IDS_REQUIRED"
  | "EMPTY_TARGET_LIST"
  | "DUPLICATE_ID"
  | "CREATE_ID_ALREADY_EXISTS"
  | "TEXT_REQUIRED"
  | "TEXT_TOO_LONG"
  | "NON_FINITE_NUMBER"
  | "POSITION_OUT_OF_RANGE"
  | "SIZE_OUT_OF_RANGE"
  | "TARGET_NOT_FOUND"
  | "TEXT_NOT_SUPPORTED"
  | "STALE_SCHEMA_VERSION"
  | "STALE_SOURCE_ADAPTER"
  | "STALE_SOURCE_OF_TRUTH"
  | "STALE_RECENT_CHANGE_COUNT"
  | "STALE_SHAPE_IDS"
  | "RECENT_TARGET_CHANGED"
  | "APPLY_FAILED";

export type AgentActionError = {
  code: AgentActionErrorCode;
  message: string;
  actionIndex?: number;
  field?: string;
  id?: string;
  expected?: string | number | string[];
  actual?: string | number | string[];
};

export type AgentActionImpact = {
  kind: AgentAction["kind"];
  targets: string[];
  creates: Array<{ id: string; type: "text" | "geo" }>;
  deletes: string[];
  changesDocumentContent: boolean;
  notes: string[];
};

export type AgentActionExpectedImpact = {
  planId?: string;
  actions: AgentActionImpact[];
  summary: {
    actionCount: number;
    creates: number;
    updates: number;
    deletes: number;
    selectionChanges: number;
  };
  safetyNotes: string[];
};

export type AgentActionValidationResult = {
  ok: boolean;
  errors: AgentActionError[];
  expectedImpact?: AgentActionExpectedImpact;
};

export type AgentActionDryRunResult = AgentActionValidationResult & {
  mode: "dry-run";
};

export type AgentActionApplyResult = {
  ok: boolean;
  status: "applied" | "refused" | "failed";
  errors: AgentActionError[];
  appliedActions: Array<{
    kind: AgentAction["kind"];
    targets: string[];
    created: string[];
    deleted?: string[];
  }>;
  expectedImpact?: AgentActionExpectedImpact;
};

const MAX_TEXT_LENGTH = 2_000;
const MIN_SIZE = 1;
const MAX_SIZE = 10_000;
const MAX_ABS_POSITION = 100_000;

/**
 * 捕获动作计划必须基于的最小上下文指纹。
 * 未来 AI 调用方会把它附加到计划上，这样验证就能判断计划应用前画布是否已变化。
 */
export function createContextReference(
  context: CanvasContext
): AgentActionContextReference {
  return {
    schemaVersion: context.schemaVersion,
    source: {
      adapter: context.source.adapter,
      sourceOfTruth: context.source.sourceOfTruth
    },
    observedChangeCount: context.recentChanges.observedChangeCount,
    shapeIds: context.shapes.map((shape) => shape.id).sort(),
    affectedShapeIds: [...context.recentChanges.affectedShapeIds].sort()
  };
}

/**
 * 基于当前画布上下文验证一个未知计划。
 * 这是主要的纯看门边界：它执行结构检查、受支持动作检查、目标存在性检查、
 * 数字/文本安全检查和过期上下文检查，并在计划合法时返回预测影响。
 */
export function validateAgentActionPlan(
  plan: unknown,
  context: CanvasContext
): AgentActionValidationResult {
  const errors: AgentActionError[] = [];

  if (!isObject(plan)) {
    return {
      ok: false,
      errors: [
        {
          code: "PLAN_NOT_OBJECT",
          message: "Action plan must be an object."
        }
      ]
    };
  }

  const contextReference = isContextReference(plan.context)
    ? plan.context
    : undefined;
  if (!contextReference) {
    errors.push({
      code: "CONTEXT_REFERENCE_REQUIRED",
      message: "Action plan must include a valid Sprint 4 context reference.",
      field: "context"
    });
  }

  if (!Array.isArray(plan.actions) || plan.actions.length === 0) {
    errors.push({
      code: "ACTIONS_REQUIRED",
      message: "Action plan must include one or more actions.",
      field: "actions"
    });
  }

  const actions = Array.isArray(plan.actions) ? plan.actions : [];
  const shapeById = new Map(context.shapes.map((shape) => [shape.id, shape]));
  const currentShapeIds = new Set(context.shapes.map((shape) => shape.id));
  const createIds = new Set<string>();
  const targetIds = new Set<string>();

  actions.forEach((action, index) => {
    validateAction(action, index, shapeById, currentShapeIds, createIds, targetIds, errors);
  });

  if (contextReference) {
    errors.push(...getStaleContextErrors(contextReference, context, targetIds));
  }

  const expectedImpact =
    errors.length === 0
      ? buildExpectedImpact(plan as AgentActionPlan)
      : undefined;

  return {
    ok: errors.length === 0,
    errors,
    ...(expectedImpact ? { expectedImpact } : {})
  };
}

/**
 * 生成与验证相同的预期影响，并通过 `mode: "dry-run"` 明确无修改契约。
 * 它作为独立 API 存在，让未来界面/智能体可以询问“会发生什么”，但不会获得应用能力。
 */
export function dryRunAgentActionPlan(
  plan: unknown,
  context: CanvasContext
): AgentActionDryRunResult {
  const validation = validateAgentActionPlan(plan, context);

  return {
    mode: "dry-run",
    ...validation,
    ...(validation.ok
      ? {
          expectedImpact: validation.expectedImpact,
          errors: []
        }
      : {})
  };
}

/**
 * 将单个动作分派到对应类型的验证器。
 * 这样动作分支被集中管理，在允许 AI 模型产出计划之前，受支持的命令表面更容易审计。
 */
function validateAction(
  action: unknown,
  actionIndex: number,
  shapeById: Map<string, CanvasShapeInventoryItem>,
  currentShapeIds: Set<string>,
  createIds: Set<string>,
  targetIds: Set<string>,
  errors: AgentActionError[]
) {
  if (!isObject(action)) {
    errors.push({
      code: "ACTION_NOT_OBJECT",
      message: "Action must be an object.",
      actionIndex
    });
    return;
  }

  switch (action.kind) {
    case "createText":
      validateCreateId(action.id, actionIndex, currentShapeIds, createIds, errors);
      validateText(action.text, actionIndex, "text", errors);
      validatePoint(action, actionIndex, errors);
      break;
    case "createGeoRectangle":
      validateCreateId(action.id, actionIndex, currentShapeIds, createIds, errors);
      if ("text" in action && action.text !== undefined) {
        validateText(action.text, actionIndex, "text", errors);
      }
      validatePoint(action, actionIndex, errors);
      validateSize(action.width, actionIndex, "width", errors);
      validateSize(action.height, actionIndex, "height", errors);
      break;
    case "moveShape":
      validateTargetId(action.id, actionIndex, shapeById, targetIds, errors);
      validatePoint(action, actionIndex, errors);
      break;
    case "updateText":
      validateTargetId(action.id, actionIndex, shapeById, targetIds, errors);
      validateText(action.text, actionIndex, "text", errors);
      if (
        typeof action.id === "string" &&
        shapeById.has(action.id) &&
        !shapeSupportsText(shapeById.get(action.id))
      ) {
        errors.push({
          code: "TEXT_NOT_SUPPORTED",
          message: "Target shape does not advertise text-bearing props.",
          actionIndex,
          field: "id",
          id: action.id
        });
      }
      break;
    case "deleteShapes":
    case "selectShapes":
      validateTargetIds(action.ids, actionIndex, shapeById, targetIds, errors);
      break;
    default:
      errors.push({
        code: "UNSUPPORTED_ACTION_KIND",
        message: "Action kind is not supported by the Sprint 5 boundary.",
        actionIndex,
        field: "kind",
        actual: typeof action.kind === "string" ? action.kind : typeof action.kind
      });
  }
}

/**
 * 验证创建动作使用的 id。新建 id 必须是图形 id，不能与当前画布冲突，
 * 也不能在同一个计划内重复。
 */
function validateCreateId(
  id: unknown,
  actionIndex: number,
  currentShapeIds: Set<string>,
  createIds: Set<string>,
  errors: AgentActionError[]
) {
  if (!isShapeId(id)) {
    errors.push({
      code: "ID_REQUIRED",
      message: "Create action requires a shape id with the shape: prefix.",
      actionIndex,
      field: "id"
    });
    return;
  }

  if (currentShapeIds.has(id)) {
    errors.push({
      code: "CREATE_ID_ALREADY_EXISTS",
      message: "Create action id already exists in the current context.",
      actionIndex,
      field: "id",
      id
    });
  }

  if (createIds.has(id)) {
    errors.push({
      code: "DUPLICATE_ID",
      message: "Create action id is duplicated in the plan.",
      actionIndex,
      field: "id",
      id
    });
  }

  createIds.add(id);
}

/**
 * 验证单个已存在目标 id，并记录它以便过期目标检查。
 * 任何实时编辑器适配器运行之前，缺失目标都会先被拒绝。
 */
function validateTargetId(
  id: unknown,
  actionIndex: number,
  shapeById: Map<string, CanvasShapeInventoryItem>,
  targetIds: Set<string>,
  errors: AgentActionError[]
) {
  if (!isShapeId(id)) {
    errors.push({
      code: "ID_REQUIRED",
      message: "Action requires an existing target shape id.",
      actionIndex,
      field: "id"
    });
    return;
  }

  targetIds.add(id);
  if (!shapeById.has(id)) {
    errors.push({
      code: "TARGET_NOT_FOUND",
      message: "Target shape id is missing from the current context.",
      actionIndex,
      field: "id",
      id
    });
  }
}

/**
 * 验证面向多个已存在图形的动作类型，比如删除和选择/聚焦。
 * 空目标列表会被拒绝，因为它很可能掩盖 AI 规划错误。
 */
function validateTargetIds(
  ids: unknown,
  actionIndex: number,
  shapeById: Map<string, CanvasShapeInventoryItem>,
  targetIds: Set<string>,
  errors: AgentActionError[]
) {
  if (!Array.isArray(ids)) {
    errors.push({
      code: "IDS_REQUIRED",
      message: "Action requires a list of target shape ids.",
      actionIndex,
      field: "ids"
    });
    return;
  }

  if (ids.length === 0) {
    errors.push({
      code: "EMPTY_TARGET_LIST",
      message: "Action requires at least one target shape id.",
      actionIndex,
      field: "ids"
    });
    return;
  }

  const seenIds = new Set<string>();
  ids.forEach((id) => {
    validateTargetId(id, actionIndex, shapeById, targetIds, errors);
    if (typeof id === "string") {
      if (seenIds.has(id)) {
        errors.push({
          code: "DUPLICATE_ID",
          message: "Target id is duplicated in the same action.",
          actionIndex,
          field: "ids",
          id
        });
      }
      seenIds.add(id);
    }
  });
}

/**
 * 验证由 `x` 和 `y` 字段表示的绝对页面空间点。
 * MVP 中智能体计划使用绝对坐标，这样试运行影响更容易推理。
 */
function validatePoint(
  action: Record<string, unknown>,
  actionIndex: number,
  errors: AgentActionError[]
) {
  validatePosition(action.x, actionIndex, "x", errors);
  validatePosition(action.y, actionIndex, "y", errors);
}

/**
 * 验证单个坐标是否有限，并检查一个刻意较宽的安全范围。
 * 这个范围可以防止失控的模型输出把图形创建到用户难以找回的极端坐标。
 */
function validatePosition(
  value: unknown,
  actionIndex: number,
  field: string,
  errors: AgentActionError[]
) {
  if (!isFiniteNumber(value)) {
    errors.push({
      code: "NON_FINITE_NUMBER",
      message: "Position values must be finite numbers.",
      actionIndex,
      field
    });
    return;
  }

  if (Math.abs(value) > MAX_ABS_POSITION) {
    errors.push({
      code: "POSITION_OUT_OF_RANGE",
      message: "Position value is outside the supported safe range.",
      actionIndex,
      field,
      actual: value,
      expected: `-${MAX_ABS_POSITION}..${MAX_ABS_POSITION}`
    });
  }
}

/**
 * 验证矩形的宽/高是否有限，并限制在安全视觉范围内。
 * 这样无需暴露完整 tldraw 样式 API，也能让生成的几何图形保持可用。
 */
function validateSize(
  value: unknown,
  actionIndex: number,
  field: string,
  errors: AgentActionError[]
) {
  if (!isFiniteNumber(value)) {
    errors.push({
      code: "NON_FINITE_NUMBER",
      message: "Size values must be finite numbers.",
      actionIndex,
      field
    });
    return;
  }

  if (value < MIN_SIZE || value > MAX_SIZE) {
    errors.push({
      code: "SIZE_OUT_OF_RANGE",
      message: "Size value is outside the supported safe range.",
      actionIndex,
      field,
      actual: value,
      expected: `${MIN_SIZE}..${MAX_SIZE}`
    });
  }
}

/**
 * 验证承载文本的动作。空文本会被视为潜在规划错误而拒绝；
 * 长文本会被限制在上限内，避免智能体通过早期 MVP 边界向画布注入巨大载荷。
 */
function validateText(
  value: unknown,
  actionIndex: number,
  field: string,
  errors: AgentActionError[]
) {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push({
      code: "TEXT_REQUIRED",
      message: "Text must be a non-empty string.",
      actionIndex,
      field
    });
    return;
  }

  if (value.length > MAX_TEXT_LENGTH) {
    errors.push({
      code: "TEXT_TOO_LONG",
      message: "Text exceeds the Sprint 5 maximum length.",
      actionIndex,
      field,
      actual: value.length,
      expected: MAX_TEXT_LENGTH
    });
  }
}

/**
 * 比较计划的上下文指纹和当前画布上下文。
 * 这是 MVP 的冲突规避策略：任何结构版本/来源不匹配、图形 id 漂移、
 * 近期变更计数漂移或新受影响目标图形，都会在应用前拒绝计划。
 */
function getStaleContextErrors(
  reference: AgentActionContextReference,
  context: CanvasContext,
  targetIds: Set<string>
): AgentActionError[] {
  const errors: AgentActionError[] = [];

  if (reference.schemaVersion !== context.schemaVersion) {
    errors.push({
      code: "STALE_SCHEMA_VERSION",
      message: "Plan context schema version does not match the current context.",
      field: "context.schemaVersion",
      expected: context.schemaVersion,
      actual: reference.schemaVersion
    });
  }

  if (reference.source.adapter !== context.source.adapter) {
    errors.push({
      code: "STALE_SOURCE_ADAPTER",
      message: "Plan source adapter does not match the current context.",
      field: "context.source.adapter",
      expected: context.source.adapter,
      actual: reference.source.adapter
    });
  }

  if (reference.source.sourceOfTruth !== context.source.sourceOfTruth) {
    errors.push({
      code: "STALE_SOURCE_OF_TRUTH",
      message: "Plan source-of-truth marker does not match the current context.",
      field: "context.source.sourceOfTruth",
      expected: context.source.sourceOfTruth,
      actual: reference.source.sourceOfTruth
    });
  }

  if (reference.observedChangeCount !== context.recentChanges.observedChangeCount) {
    errors.push({
      code: "STALE_RECENT_CHANGE_COUNT",
      message: "Canvas recent-change count changed since the plan was prepared.",
      field: "context.observedChangeCount",
      expected: context.recentChanges.observedChangeCount,
      actual: reference.observedChangeCount
    });
  }

  const currentShapeIds = context.shapes.map((shape) => shape.id).sort();
  if (!sameStringSet(reference.shapeIds, currentShapeIds)) {
    errors.push({
      code: "STALE_SHAPE_IDS",
      message: "Current shape ids do not match the plan context reference.",
      field: "context.shapeIds",
      expected: currentShapeIds,
      actual: [...reference.shapeIds].sort()
    });
  }

  const referencedAffectedIds = new Set(reference.affectedShapeIds);
  const changedTargets = context.recentChanges.affectedShapeIds.filter(
    (id) => targetIds.has(id) && !referencedAffectedIds.has(id)
  );
  if (changedTargets.length > 0) {
    const [firstChangedTarget] = changedTargets;
    errors.push({
      code: "RECENT_TARGET_CHANGED",
      message: "A target shape was affected by recent changes not present in the plan reference.",
      field: "context.affectedShapeIds",
      ...(firstChangedTarget ? { id: firstChangedTarget } : {}),
      actual: changedTargets.sort()
    });
  }

  return errors;
}

/**
 * 为合法计划构建可序列化的试运行影响摘要。
 * 摘要刻意保持描述性而不是可执行；实际修改仍然留在 tldraw 适配器中。
 */
function buildExpectedImpact(plan: AgentActionPlan): AgentActionExpectedImpact {
  const actions = plan.actions.map((action): AgentActionImpact => {
    switch (action.kind) {
      case "createText":
        return {
          kind: action.kind,
          targets: [],
          creates: [{ id: action.id, type: "text" }],
          deletes: [],
          changesDocumentContent: true,
          notes: [`Create text shape ${action.id}.`]
        };
      case "createGeoRectangle":
        return {
          kind: action.kind,
          targets: [],
          creates: [{ id: action.id, type: "geo" }],
          deletes: [],
          changesDocumentContent: true,
          notes: [`Create geo rectangle ${action.id}.`]
        };
      case "moveShape":
        return {
          kind: action.kind,
          targets: [action.id],
          creates: [],
          deletes: [],
          changesDocumentContent: true,
          notes: [`Move shape ${action.id} to an absolute position.`]
        };
      case "updateText":
        return {
          kind: action.kind,
          targets: [action.id],
          creates: [],
          deletes: [],
          changesDocumentContent: true,
          notes: [`Update text-bearing shape ${action.id}.`]
        };
      case "deleteShapes":
        return {
          kind: action.kind,
          targets: [...action.ids],
          creates: [],
          deletes: [...action.ids],
          changesDocumentContent: true,
          notes: [`Delete ${action.ids.length} shape(s).`]
        };
      case "selectShapes":
        return {
          kind: action.kind,
          targets: [...action.ids],
          creates: [],
          deletes: [],
          changesDocumentContent: false,
          notes: [
            action.focus
              ? "Select target shape(s) and focus the viewport if needed."
              : "Select target shape(s)."
          ]
        };
    }
  });

  return {
    ...(plan.planId ? { planId: plan.planId } : {}),
    actions,
    summary: {
      actionCount: actions.length,
      creates: actions.reduce((sum, action) => sum + action.creates.length, 0),
      updates: actions.filter(
        (action) =>
          action.kind === "moveShape" || action.kind === "updateText"
      ).length,
      deletes: actions.reduce((sum, action) => sum + action.deletes.length, 0),
      selectionChanges: actions.filter(
        (action) => action.kind === "selectShapes"
      ).length
    },
    safetyNotes: [
      "Validation and dry-run are pure and do not mutate the tldraw editor.",
      "Only an explicit apply call may mutate the mounted editor."
    ]
  };
}

/**
 * 基于上下文清单信号判断目标图形是否可以安全更新文本。
 * 策略偏保守，只允许已知承载文本的默认图形，或显式暴露 text/richText 属性的图形。
 */
function shapeSupportsText(shape: CanvasShapeInventoryItem | undefined): boolean {
  if (!shape) {
    return false;
  }

  return (
    shape.propKeys.includes("text") ||
    shape.propKeys.includes("richText") ||
    shape.type === "text" ||
    shape.type === "geo" ||
    shape.type === "note"
  );
}

/**
 * 上下文引用结构的运行时守卫。
 * 计划以 `unknown` 进入，因为未来 AI 输出必须先经过验证才能被信任。
 */
function isContextReference(
  value: unknown
): value is AgentActionContextReference {
  return (
    isObject(value) &&
    value.schemaVersion === 1 &&
    isObject(value.source) &&
    typeof value.source.adapter === "string" &&
    typeof value.source.sourceOfTruth === "string" &&
    typeof value.observedChangeCount === "number" &&
    Number.isFinite(value.observedChangeCount) &&
    Array.isArray(value.shapeIds) &&
    value.shapeIds.every((id) => typeof id === "string") &&
    Array.isArray(value.affectedShapeIds) &&
    value.affectedShapeIds.every((id) => typeof id === "string")
  );
}

/**
 * 排序后比较字符串集合。用于过期图形 id 检查，因为这里顺序不应该影响结果。
 */
function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

/**
 * 类 JSON 对象的收窄辅助函数。数组会被排除，因为动作计划和动作必须是带键的记录。
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 有限 JavaScript 数字的收窄辅助函数。拒绝 `NaN` 和无穷值可以让
 * 动作结果同时保持 JSON 安全和编辑器安全。
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * 验证当前 MVP 动作边界接受的受限图形 id 格式。
 * 这个规则比任意 tldraw id 更严格，让开发者控制台示例和 AI 生成 id 更可预测。
 */
function isShapeId(value: unknown): value is string {
  return typeof value === "string" && /^shape:[A-Za-z0-9_-]+$/.test(value);
}
