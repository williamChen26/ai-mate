/**
 * MVP 运行时契约的浏览器冒烟测试。这个文件按用户/开发者真实使用路径验证：
 * 加载画布，通过浏览器钩子读取上下文，试运行一个智能体动作，显式应用，
 * 然后验证过期计划会被拒绝。
 */
import { expect, test } from "@playwright/test";

test("loads the canvas workspace and keeps tldraw interactive", async ({
  page
}) => {
  await page.goto("/");

  await expect(page.getByTestId("canvas-shell")).toBeVisible();
  await expect(page.getByText("Production Spec Graph")).toBeVisible();
  await expect(page.getByText("AI coworker canvas")).toBeVisible();
  await expect(page.getByText("Source tldraw")).toBeVisible();
  await expect(page.getByText("Collaboration planned")).toBeVisible();

  const editor = page.locator(".tl-container").first();
  await expect(editor).toBeVisible();

  const box = await editor.boundingBox();
  expect(box?.width).toBeGreaterThan(300);
  expect(box?.height).toBeGreaterThan(300);

  await page.keyboard.press("v");
  await page.mouse.click(420, 260);
  await page.mouse.wheel(0, -400);

  await page.waitForFunction(
    () =>
      typeof window.__PSG_CANVAS_CONTEXT__?.extract ===
      "function"
  );
  await page.waitForFunction(
    () => typeof window.__PSG_AGENT_ACTIONS__?.dryRun === "function"
  );

  const extractedContext = await page.evaluate(() => {
    const context = window.__PSG_CANVAS_CONTEXT__?.extract();
    return {
      context,
      serialized: JSON.stringify(context)
    };
  });

  expect(extractedContext.context?.source.kind).toBe("tldraw");
  expect(extractedContext.context?.source.sourceOfTruth).toBe(
    "tldraw-editor-store-document-state"
  );
  expect(extractedContext.context?.document).toBeTruthy();
  expect(extractedContext.context?.shapes).toBeInstanceOf(Array);
  expect(extractedContext.context?.selection).toBeTruthy();
  expect(extractedContext.context?.viewport).toBeTruthy();
  expect(extractedContext.context?.recentChanges.scope).toBe("local-session");
  expect(
    extractedContext.context?.futureAgentConstraints.unsupportedAssumptions
  ).toContain("no-ai-model-calls");
  expect(extractedContext.serialized).toContain(
    "tldraw-editor-store-document-state"
  );

  const actionExercise = await page.evaluate(() => {
    /**
     * 通过未来智能体代码会使用的同一个开发者钩子读取实时上下文。
     * 端到端路径保持基于钩子，可以验证真实浏览器集成，而不仅是纯模块。
     */
    const extract = () => window.__PSG_CANVAS_CONTEXT__!.extract();
    /**
     * 在浏览器沙箱内镜像 `createContextReference`，
     * 让冒烟测试不需要把应用模块导入 Playwright 里也能准备真实计划。
     */
    const toReference = (context: ReturnType<typeof extract>) => ({
      schemaVersion: context.schemaVersion,
      source: {
        adapter: context.source.adapter,
        sourceOfTruth: context.source.sourceOfTruth
      },
      observedChangeCount: context.recentChanges.observedChangeCount,
      shapeIds: context.shapes.map((shape) => shape.id).sort(),
      affectedShapeIds: [...context.recentChanges.affectedShapeIds].sort()
    });
    /**
     * 将上下文缩减成稳定标记；这些字段在试运行或无效/过期检查期间不应该变化。
     */
    const comparableMarkers = (context: ReturnType<typeof extract>) => ({
      shapeCount: context.document.shapeCount,
      shapeIds: context.shapes.map((shape) => shape.id).sort(),
      selectedShapeIds: [...context.selection.shapeIds].sort(),
      recentChangeCount: context.recentChanges.observedChangeCount
    });

    const baseline = extract();
    const createId = `shape:psg-e2e-${Date.now()}`;
    const plan = {
      planId: "plan:e2e-create-text",
      context: toReference(baseline),
      actions: [
        {
          kind: "createText",
          id: createId,
          text: "Sprint 5 hook smoke",
          x: 120,
          y: 160
        }
      ]
    };

    const baselineMarkers = comparableMarkers(baseline);
    const validation = window.__PSG_AGENT_ACTIONS__!.validate(plan);
    const dryRun = window.__PSG_AGENT_ACTIONS__!.dryRun(plan);
    const afterDryRun = extract();
    const applyResult = window.__PSG_AGENT_ACTIONS__!.apply(plan);
    const afterApply = extract();
    const staleResult = window.__PSG_AGENT_ACTIONS__!.dryRun(plan);
    const afterStale = extract();

    return {
      createId,
      validation,
      dryRun,
      dryRunSerialized: JSON.stringify(dryRun),
      dryRunMarkersUnchanged:
        JSON.stringify(baselineMarkers) ===
        JSON.stringify(comparableMarkers(afterDryRun)),
      applyResult,
      afterApplyMarkers: comparableMarkers(afterApply),
      appliedShape: afterApply.shapes.find((shape) => shape.id === createId),
      staleResult,
      staleMarkersUnchanged:
        JSON.stringify(comparableMarkers(afterApply)) ===
        JSON.stringify(comparableMarkers(afterStale))
    };
  });

  expect(actionExercise.validation.ok).toBe(true);
  expect(actionExercise.validation.errors).toEqual([]);
  expect(actionExercise.dryRun.ok).toBe(true);
  expect(actionExercise.dryRun.expectedImpact?.summary.creates).toBe(1);
  expect(actionExercise.dryRunSerialized).toContain("dry-run");
  expect(actionExercise.dryRunMarkersUnchanged).toBe(true);
  expect(actionExercise.applyResult.ok).toBe(true);
  expect(actionExercise.applyResult.status).toBe("applied");
  expect(actionExercise.applyResult.appliedActions[0]?.created).toContain(
    actionExercise.createId
  );
  expect(actionExercise.appliedShape).toEqual(
    expect.objectContaining({
      id: actionExercise.createId,
      type: "text"
    })
  );
  expect(actionExercise.afterApplyMarkers.shapeIds).toContain(
    actionExercise.createId
  );
  expect(actionExercise.staleResult.ok).toBe(false);
  expect(actionExercise.staleResult.errors.map((error) => error.code)).toEqual(
    expect.arrayContaining(["STALE_SHAPE_IDS"])
  );
  expect(actionExercise.staleMarkersUnchanged).toBe(true);

  await expect(editor).toBeVisible();
  await expect(page.getByText(/Unhandled Runtime Error|Failed to compile/i)).toHaveCount(
    0
  );
});
