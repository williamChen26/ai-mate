import { expect, test, type Page } from "@playwright/test";

test("loads the canvas workspace and keeps tldraw interactive", async ({
  page
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/rooms\/room-[A-Za-z0-9._-]+$/);

  await expect(page.getByTestId("canvas-shell")).toBeVisible();
  await expect(page.getByText("Production Spec Graph")).toBeVisible();
  await expect(page.getByText("AI coworker canvas")).toBeVisible();
  await expect(page.getByText("Source tldraw")).toBeVisible();
  await expect(page.getByTestId("sync-status")).toHaveText("Backend sync");
  await expect(page.getByTestId("sync-status")).toHaveAttribute(
    "data-state",
    "online"
  );
  await expect(page.getByTestId("collab-identity")).toContainText(/^Device /);

  const editor = page.locator(".tl-container").first();
  await expect(editor).toBeVisible();

  const box = await editor.boundingBox();
  expect(box?.width).toBeGreaterThan(300);
  expect(box?.height).toBeGreaterThan(300);

  await page.keyboard.press("v");
  await page.mouse.click(420, 260);
  await page.mouse.wheel(0, -400);

  const roomId = page.url().split("/rooms/").at(1);
  expect(roomId).toMatch(/^room-[A-Za-z0-9._-]+$/);
  await expect(page.getByTestId("collab-identity")).toHaveAttribute(
    "title",
    /^Tab [A-Z0-9]{4}$/
  );

  const shareButton = page.getByTestId("share-room-button");
  await expect(shareButton).toHaveAttribute("data-share-url", page.url());
  await shareButton.click();
  await expect(shareButton).toHaveText(/Copied|Link ready/);

  await expect(editor).toBeVisible();
  await expect(page.getByText(/Unhandled Runtime Error|Failed to compile/i)).toHaveCount(
    0
  );
});

test("syncs one room between independent browser contexts", async ({
  browser
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();

  try {
    const roomPath = `/rooms/e2e-shared-room-${Date.now()}`;
    await firstPage.goto(roomPath);
    await secondPage.goto(roomPath);

    await expect(firstPage.getByTestId("sync-status")).toHaveText(
      "Backend sync"
    );
    await expect(secondPage.getByTestId("sync-status")).toHaveText(
      "Backend sync"
    );

    expect(firstPage.url()).toContain(roomPath);
    expect(secondPage.url()).toContain(roomPath);

    const firstIdentity = await readIdentity(firstPage);
    const secondIdentity = await readIdentity(secondPage);
    expect(firstIdentity.deviceLabel).toMatch(/^Device [A-Z0-9]{4}$/);
    expect(secondIdentity.deviceLabel).toMatch(/^Device [A-Z0-9]{4}$/);
    expect(firstIdentity.sessionLabel).toMatch(/^Tab [A-Z0-9]{4}$/);
    expect(secondIdentity.sessionLabel).toMatch(/^Tab [A-Z0-9]{4}$/);
    await expect(firstPage.getByTestId("collab-identity")).toContainText(
      firstIdentity.deviceLabel
    );
    await expect(secondPage.getByTestId("collab-identity")).toContainText(
      secondIdentity.deviceLabel
    );

    await firstPage.reload();
    await expect(firstPage).toHaveURL(new RegExp(`${roomPath}$`));
    await expect(firstPage.getByTestId("sync-status")).toHaveText(
      "Backend sync"
    );
    const afterReloadIdentity = await readIdentity(firstPage);
    expect(afterReloadIdentity.deviceLabel).toBe(firstIdentity.deviceLabel);

    const syncedText = `Sync ${Date.now()}`;
    await createTextShapeThroughUi(firstPage, syncedText);
    await waitForContextShapeCount(secondPage, 1);

    await firstPage.goto("/");
    await expect(firstPage).toHaveURL(/\/rooms\/room-[A-Za-z0-9._-]+$/);
    const generatedUrl = firstPage.url();
    await firstPage.goBack();
    await expect(firstPage).toHaveURL(new RegExp(`${roomPath}$`));
    await firstPage.goForward();
    await expect(firstPage).toHaveURL(generatedUrl);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test("publishes room context snapshots and operation events to the backend", async ({
  page
}) => {
  const roomPath = `/rooms/e2e-context-${Date.now()}`;
  await page.goto(roomPath);
  await expect(page.getByTestId("sync-status")).toHaveText("Backend sync");

  const contextText = `Ctx ${Date.now()}`;
  await createTextShapeThroughUi(page, contextText);
  await page.waitForFunction(() => Boolean(window.__PSG_ROOM_CONTEXT__));

  const result = await page.evaluate(async () => {
    const api = window.__PSG_ROOM_CONTEXT__;
    if (!api) {
      throw new Error("Room context hook was not registered.");
    }

    const snapshot = await api.publishSnapshot();
    const canvasEvent = await api.emitCanvasChange({
      summary: "e2e canvas change"
    });
    const chatEvent = await api.emitChatBoundary("what should I do next?");
    const context = await api.getServerContext();

    return { snapshot, canvasEvent, chatEvent, context };
  });

  expect(result.snapshot).toMatchObject({ ok: true });
  expect(result.canvasEvent).toMatchObject({ ok: true });
  expect(result.chatEvent).toMatchObject({ ok: true });
  expect(result.context).toMatchObject({
    roomId: roomPath.replace("/rooms/", ""),
    latestSnapshot: {
      roomId: roomPath.replace("/rooms/", "")
    },
    freshness: {
      changedSinceSnapshot: true
    }
  });
  expect(result.context?.latestSnapshot?.document.shapeCount).toBeGreaterThan(0);
  expect(
    result.context?.latestSnapshot?.document.shapes.some(
      (shape) => shape.type === "text"
    )
  ).toBe(true);
  expect(result.context?.recentEvents.map((event) => event.kind)).toEqual(
    expect.arrayContaining(["canvas-change", "chat-boundary"])
  );
});

test("sends a raw mate message and renders structured response data", async ({
  page
}) => {
  const roomPath = `/rooms/e2e-mate-${Date.now()}`;
  await page.goto(roomPath);
  await expect(page.getByTestId("sync-status")).toHaveText("Backend sync");

  await createTextShapeThroughUi(page, `Mate ${Date.now()}`);
  await page.getByTestId("mate-message-input").fill("Can you organize this?");
  await page.getByTestId("mate-send-button").click();

  await expect(page.getByTestId("mate-status")).toHaveText(/Sending|Ready/);
  await expect(page.getByTestId("mate-raw-result")).toContainText(
    roomPath.replace("/rooms/", "")
  );
  await expect(page.getByTestId("mate-raw-result")).toContainText(
    "observations"
  );
  await expect(page.getByTestId("mate-raw-result")).toContainText(
    "interpretation"
  );
  await expect(page.getByTestId("mate-raw-result")).toContainText(
    "nonMutating"
  );
  await expect(page.locator(".tl-container").first()).toBeVisible();
});

test("renders a proposed canvas action without applying it automatically", async ({
  page
}) => {
  const roomPath = `/rooms/e2e-proposal-${Date.now()}`;
  await page.goto(roomPath);
  await expect(page.getByTestId("sync-status")).toHaveText("Backend sync");

  await createTextShapeThroughUi(page, `Proposal ${Date.now()}`);
  const beforeCount = await readContextShapeCount(page);

  await page.getByTestId("mate-message-input").fill("Add a note for follow up");
  await page.getByTestId("mate-send-button").click();

  await expect(page.getByTestId("mate-raw-result")).toContainText(
    "canvas-action-proposal"
  );
  await expect(page.getByTestId("mate-raw-result")).toContainText(
    "requiresAcceptance"
  );
  await expect(page.getByTestId("mate-raw-result")).toContainText(
    '"applied": false'
  );
  await page.getByTestId("mate-diagnostics-button").click();
  await expect(page.getByTestId("mate-diagnostics-raw")).toContainText(
    roomPath.replace("/rooms/", "")
  );
  await expect(page.getByTestId("mate-diagnostics-raw")).toContainText(
    "agentLifecycle"
  );
  await expect(page.getByTestId("mate-diagnostics-raw")).toContainText(
    "context"
  );
  await expect(page.getByTestId("mate-diagnostics-raw")).toContainText(
    "canvas-action-proposal"
  );
  await expect(page.getByTestId("mate-diagnostics-raw")).toContainText(
    "outputValidation"
  );
  await expect
    .poll(() => readContextShapeCount(page), { timeout: 3_000 })
    .toBe(beforeCount);
});

test("keeps same-device tabs as independent live sessions", async ({
  browser
}) => {
  const context = await browser.newContext();
  const firstPage = await context.newPage();
  const secondPage = await context.newPage();

  try {
    const roomPath = `/rooms/e2e-same-device-${Date.now()}`;
    await firstPage.goto(roomPath);
    await expect(firstPage.getByTestId("sync-status")).toHaveText(
      "Backend sync"
    );

    await secondPage.goto(roomPath);
    await expect(secondPage.getByTestId("sync-status")).toHaveText(
      "Backend sync"
    );

    const firstIdentity = await readIdentity(firstPage);
    const secondIdentity = await readIdentity(secondPage);

    expect(firstPage.url()).toContain(roomPath);
    expect(secondPage.url()).toContain(roomPath);
    expect(firstIdentity.deviceLabel).toBe(secondIdentity.deviceLabel);
    expect(firstIdentity.sessionLabel).not.toBe(secondIdentity.sessionLabel);

    await expect(firstPage.locator(".tl-container").first()).toBeVisible();
    await expect(secondPage.locator(".tl-container").first()).toBeVisible();
  } finally {
    await context.close();
  }
});

test("rejects invalid room routes before sync starts", async ({ page }) => {
  await page.goto("/rooms/%2E%2E%2Fbad");

  await expect(page.getByTestId("canvas-shell")).toBeVisible();
  await expect(page.getByTestId("sync-status")).toHaveText("Sync raw error");
  await expect(page.locator(".canvas-shell__error")).toContainText(
    "Room link is not valid"
  );
  await expect(page.locator(".canvas-shell__error")).toContainText(
    "INVALID_ROOM_ID"
  );

  await expect(page.locator(".tl-container")).toHaveCount(0);
});

async function createTextShapeThroughUi(
  page: Page,
  text: string
): Promise<void> {
  const editor = page.locator(".tl-container").first();
  await expect(editor).toBeVisible();

  const box = await editor.boundingBox();
  expect(box).toBeTruthy();

  await page.keyboard.press("t");
  await page.mouse.click((box?.x ?? 0) + 260, (box?.y ?? 0) + 220);
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");

  await waitForContextShapeCount(page, 1);
}

async function waitForContextShapeCount(page: Page, minCount: number) {
  await page.waitForFunction(
    (count) =>
      (window.__PSG_ROOM_CONTEXT__?.extractSnapshot().document.shapeCount ?? 0) >=
      count,
    minCount,
    { timeout: 8_000 }
  );
}

async function readContextShapeCount(page: Page) {
  return page.evaluate(
    () => window.__PSG_ROOM_CONTEXT__?.extractSnapshot().document.shapeCount ?? 0
  );
}

async function readIdentity(page: Page) {
  const identity = page.getByTestId("collab-identity");
  await expect(identity).toBeVisible();
  const deviceLabel = (await identity.textContent())?.trim() ?? "";
  const sessionLabel = (await identity.getAttribute("title")) ?? "";
  return { deviceLabel, sessionLabel };
}
