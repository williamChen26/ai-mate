import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { chromium } from "@playwright/test";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
const chromeChannel = "chrome";

const processes = new Set();

main()
  .then(() => {
    console.log("sync recovery smoke: PASS");
  })
  .catch((error) => {
    console.error("sync recovery smoke: FAIL");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopAllProcesses();
  });

async function main() {
  await runBackendUnavailableScenario();
  await runBackendRestartScenario();
}

async function runBackendUnavailableScenario() {
  const webPort = 3320;
  const unavailableBackendPort = 3399;
  const web = startProcess(
    "pnpm",
    [
      "--filter",
      "@production-spec-graph/web",
      "exec",
      "next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(webPort)
    ],
    {
      NEXT_PUBLIC_PSG_SYNC_SERVER_URL: `http://127.0.0.1:${unavailableBackendPort}`
    }
  );

  try {
    await waitForHttp(`http://127.0.0.1:${webPort}`);
    const browser = await chromium.launch({ channel: chromeChannel });
    try {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const roomPath = `/rooms/e2e-backend-down-${Date.now()}`;
      await page.goto(`http://127.0.0.1:${webPort}${roomPath}`);
      await page.waitForSelector('[data-testid="canvas-shell"]');
      await waitForStatus(page, "Backend unavailable", 8_000);

      const statusText = await readStatusText(page);
      const statusDetail = await readStatusDetail(page);
      assert(statusText === "Backend unavailable", "backend-down status label");
      assert(page.url().endsWith(roomPath), "backend-down route stayed stable");
      assert(
        statusDetail.includes("configured sync backend"),
        "backend-down status explains the configured backend wait"
      );
      assert(pageErrors.length === 0, `unexpected page errors: ${pageErrors}`);
    } finally {
      await browser.close();
    }
  } finally {
    await stopProcess(web);
  }
}

async function runBackendRestartScenario() {
  const backendPort = 3321;
  const webPort = 3322;
  let backend = startBackend(backendPort, webPort);
  const web = startProcess(
    "pnpm",
    [
      "--filter",
      "@production-spec-graph/web",
      "exec",
      "next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(webPort)
    ],
    {
      NEXT_PUBLIC_PSG_SYNC_SERVER_URL: `http://127.0.0.1:${backendPort}`
    }
  );

  try {
    await waitForHttp(`http://127.0.0.1:${backendPort}/ready`);
    await waitForHttp(`http://127.0.0.1:${webPort}`);

    const browser = await chromium.launch({ channel: chromeChannel });
    try {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const roomPath = `/rooms/e2e-restart-${Date.now()}`;
      await page.goto(`http://127.0.0.1:${webPort}${roomPath}`);
      await waitForStatus(page, "Backend sync", 15_000);

      await stopProcess(backend);
      await waitForAnyStatus(
        page,
        ["Sync reconnecting", "Backend unavailable", "Sync error"],
        15_000
      );
      const interruptedDetail = await readStatusDetail(page);
      assert(
        interruptedDetail.includes("process-local") ||
          interruptedDetail.includes("in-memory room may reset"),
        "interruption status explains process-local reset risk"
      );

      backend = startBackend(backendPort, webPort);
      await waitForHttp(`http://127.0.0.1:${backendPort}/ready`);
      await waitForStatus(page, "Backend sync", 25_000);

      assert(page.url().endsWith(roomPath), "restart route stayed stable");
      assert(
        (await readStatusText(page)) === "Backend sync",
        "restart reconnected"
      );
      assert(pageErrors.length === 0, `unexpected page errors: ${pageErrors}`);
    } finally {
      await browser.close();
    }
  } finally {
    await stopProcess(backend);
    await stopProcess(web);
  }
}

function startBackend(port, webPort) {
  return startProcess(
    "pnpm",
    ["--filter", "@production-spec-graph/server", "dev"],
    {
      PORT: String(port),
      ALLOWED_ORIGINS: `http://127.0.0.1:${webPort}`
    }
  );
}

function startProcess(command, args, env = {}) {
  const proc = spawn(command, args, {
    cwd: repoRoot,
    detached: true,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const logs = [];

  proc.stdout.on("data", (chunk) => keepLog(logs, chunk));
  proc.stderr.on("data", (chunk) => keepLog(logs, chunk));
  proc.on("exit", () => processes.delete(proc));
  proc.logs = logs;
  processes.add(proc);

  return proc;
}

async function stopAllProcesses() {
  await Promise.all([...processes].map((proc) => stopProcess(proc)));
}

async function stopProcess(proc) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) {
    processes.delete(proc);
    return;
  }

  try {
    process.kill(-proc.pid, "SIGTERM");
  } catch {
    proc.kill("SIGTERM");
  }

  const stopped = await waitForExit(proc, 3_000);
  if (!stopped) {
    try {
      process.kill(-proc.pid, "SIGKILL");
    } catch {
      proc.kill("SIGKILL");
    }
    await waitForExit(proc, 3_000);
  }
  processes.delete(proc);
}

async function waitForExit(proc, timeoutMs) {
  if (proc.exitCode !== null || proc.signalCode !== null) {
    return true;
  }

  return await Promise.race([
    new Promise((resolve) => proc.once("exit", () => resolve(true))),
    delay(timeoutMs).then(() => false)
  ]);
}

async function waitForHttp(url, timeoutMs = 60_000) {
  const started = Date.now();
  let lastError;

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }

  throw new Error(
    `Timed out waiting for ${url}: ${lastError?.message ?? "unknown error"}`
  );
}

async function waitForStatus(page, expectedStatus, timeoutMs) {
  await waitForAnyStatus(page, [expectedStatus], timeoutMs);
}

async function waitForAnyStatus(page, expectedStatuses, timeoutMs) {
  await page.waitForFunction(
    (labels) =>
      labels.includes(
        document.querySelector('[data-testid="sync-status"]')?.textContent?.trim()
      ),
    expectedStatuses,
    { timeout: timeoutMs }
  );
}

async function readStatusText(page) {
  return (
    (await page.locator('[data-testid="sync-status"]').textContent())?.trim() ??
    ""
  );
}

async function readStatusDetail(page) {
  return (await page.locator('[data-testid="sync-status"]').getAttribute("title")) ?? "";
}

function keepLog(logs, chunk) {
  logs.push(String(chunk));
  if (logs.length > 30) {
    logs.shift();
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
