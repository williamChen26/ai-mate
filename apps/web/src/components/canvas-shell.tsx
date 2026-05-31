"use client";

/**
 * CanvasShell 是 MVP 的客户端组合根。它采用端口与适配器形态：
 * tldraw 拥有实时编辑器，库模块拥有纯上下文/动作逻辑，
 * 这个组件负责把这些边界接到面向开发者的浏览器钩子上，同时不添加产品 UI。
 */
import { Tldraw, type Editor } from "tldraw";

import { createRecentCanvasChangeTracker } from "@/lib/recent-canvas-changes";
import {
  buildCanvasContextFromEditor,
  getChangedRecordIdsFromStoreEvent
} from "@/lib/tldraw-canvas-context";
import type { CanvasContext } from "@/lib/canvas-context";
import {
  dryRunAgentActionPlan,
  validateAgentActionPlan,
  type AgentActionDryRunResult,
  type AgentActionValidationResult,
  type AgentActionApplyResult
} from "@/lib/agent-actions";
import { applyAgentActionPlanToEditor } from "@/lib/tldraw-agent-actions";

declare global {
  interface Window {
    __PSG_CANVAS_CONTEXT__?: {
      extract: () => CanvasContext;
    };
    __PSG_AGENT_ACTIONS__?: {
      validate: (plan: unknown) => AgentActionValidationResult;
      dryRun: (plan: unknown) => AgentActionDryRunResult;
      apply: (plan: unknown) => AgentActionApplyResult;
    };
  }
}

/**
 * 渲染全屏 tldraw 工作区，并在编辑器挂载期间注册智能体就绪钩子。
 * 组件刻意保持很薄，让画布抽取和动作安全规则能在 React 外部测试。
 */
export function CanvasShell() {
  /**
   * 处理 tldraw 挂载生命周期。它创建本地近期变更追踪器，
   * 暴露只读上下文抽取，暴露显式验证/试运行/应用动作方法，
   * 并在卸载时清理所有钩子。
   */
  function handleEditorMount(editor: Editor) {
    const recentChanges = createRecentCanvasChangeTracker();
    const unsubscribeFromStore = editor.store.listen(
      (entry) => {
        recentChanges.recordChangeIds(
          getChangedRecordIdsFromStoreEvent(entry),
          entry.source
        );
      },
      { source: "user", scope: "all" }
    );
    const contextHook = {
      /**
       * 按需抽取当前画布上下文，而不是缓存它。
       * 这样控制台检查和未来智能体读取都能和实时 tldraw 编辑器状态对齐。
       */
      extract: () =>
        buildCanvasContextFromEditor(editor, recentChanges.getSummary())
    };
    const actionHook = {
      /**
       * 基于最新抽取的上下文验证计划。新鲜上下文很重要，
       * 因为过期检查只有在验证看到最新编辑器状态时才可靠。
       */
      validate: (plan: unknown) =>
        validateAgentActionPlan(plan, contextHook.extract()),
      /**
       * 在不修改编辑器的情况下计算预期影响。
       * 未来提案界面应先调用这个方法，再请求用户显式批准。
       */
      dryRun: (plan: unknown) =>
        dryRunAgentActionPlan(plan, contextHook.extract()),
      /**
       * 只通过 tldraw 适配器执行应用，并且适配器会在修改边界再次验证计划。
       */
      apply: (plan: unknown) =>
        applyAgentActionPlanToEditor(editor, plan, contextHook.extract())
    };

    window.__PSG_CANVAS_CONTEXT__ = contextHook;
    window.__PSG_AGENT_ACTIONS__ = actionHook;

    return () => {
      unsubscribeFromStore();
      if (window.__PSG_CANVAS_CONTEXT__ === contextHook) {
        delete window.__PSG_CANVAS_CONTEXT__;
      }
      if (window.__PSG_AGENT_ACTIONS__ === actionHook) {
        delete window.__PSG_AGENT_ACTIONS__;
      }
    };
  }

  return (
    <main className="canvas-shell" data-testid="canvas-shell">
      <header className="canvas-shell__bar" aria-label="Canvas workspace">
        <div className="canvas-shell__brand">
          <div className="canvas-shell__mark" aria-hidden="true">
            PS
          </div>
          <div className="canvas-shell__title">
            <strong>Production Spec Graph</strong>
            <span>AI coworker canvas</span>
          </div>
        </div>
        <div className="canvas-shell__status" aria-label="Canvas direction">
        </div>
      </header>
      <section className="canvas-shell__workspace" aria-label="Infinite canvas">
        <div className="canvas-shell__editor" data-testid="tldraw-host">
          <Tldraw
            persistenceKey="production-spec-graph-mvp"
            onMount={handleEditorMount}
          />
        </div>
      </section>
    </main>
  );
}
