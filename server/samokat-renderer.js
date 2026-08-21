import { spawn } from "node:child_process";
import { chownSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { MetadataFetchError, resolvePublicHost } from "./metadata-fetch.js";
import { parseStructuredProductMetadata } from "./metadata.js";
import {
  canonicalRetailerProductUrl,
  canonicalSamokatProductUrl,
  isAllowedRetailerBrowserUrl,
  isSameRetailerProduct,
  retailerProductPolicy,
} from "./retailer-product.js";

const DEFAULT_TIMEOUT_MS = 12_000;
const LENTA_TIMEOUT_MS = 20_000;
const MAX_HEAD_BYTES = 300_000;
const MAX_RENDER_QUEUE = 6;
const BROWSER_RETRY_DELAY_MS = 30_000;
const CLEANUP_TIMEOUT_MS = 1_000;
const INTERACTIVE_CHALLENGE = /(?:разверните\s+картинку\s+горизонтально|пройдите\s+проверку,?\s+чтобы\s+получить\s+доступ)/iu;
const LOCAL_BROWSER_PATHS = [
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

let browserStatePromise = null;
let spawnedBrowser = null;
let spawnedProfile = "";
let browserUnavailableUntil = 0;
let activeRenders = 0;
const waitingRenders = [];
const renderJobs = new Map();
const protectedContexts = new WeakMap();
const retailerUnavailableUntil = new Map();
const browserHostChecks = new Map();

function renderError(retailerId, message, suffix, cause) {
  return new MetadataFetchError(message, { code: `${retailerId}_${suffix}`, cause });
}

function renderTimeoutError(retailerId, cause) {
  return renderError(retailerId, `${retailerProductPolicy(retailerId).label} не ответил вовремя`, "render_timeout", cause);
}

function remainingDeadlineMs(deadline) {
  return Math.max(0, deadline - Date.now());
}

async function beforeDeadline(task, deadline, retailerId = "samokat") {
  const timeoutMs = remainingDeadlineMs(deadline);
  if (timeoutMs <= 0) throw renderTimeoutError(retailerId);

  let timer;
  const operation = Promise.resolve().then(task);
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(renderTimeoutError(retailerId)), timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function settleWithin(task, timeoutMs) {
  const operation = Promise.resolve().then(task).then(() => true, () => true);
  if (timeoutMs <= 0) {
    void operation;
    return false;
  }

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const settled = await Promise.race([operation, timeout]);
  clearTimeout(timer);
  return settled;
}

export { canonicalSamokatProductUrl };

export function isSamokatProductHead(value) {
  const html = String(value ?? "");
  return html.length <= MAX_HEAD_BYTES
    && parseStructuredProductMetadata(html, "https://metadata.invalid/product").productFound;
}

export function isRetailerProductDocument(value) {
  return isSamokatProductHead(value);
}

export function isInteractiveSamokatChallenge(value) {
  return INTERACTIVE_CHALLENGE.test(String(value ?? "").slice(0, 20_000));
}

export function isAllowedSamokatBrowserUrl(value) {
  return isAllowedRetailerBrowserUrl("samokat", value);
}

function browserSetting(name) {
  return String(process.env[`RETAILER_${name}`] || process.env[`SAMOKAT_${name}`] || "").trim();
}

function browserExecutablePath(retailerId) {
  const configured = browserSetting("CHROMIUM_PATH");
  if (configured) {
    if (existsSync(configured)) return configured;
    throw renderError(retailerId, "Chromium для импорта товаров не найден", "browser_missing");
  }
  const detected = LOCAL_BROWSER_PATHS.find((candidate) => existsSync(candidate));
  if (detected) return detected;
  throw renderError(retailerId, "Chromium для импорта товаров не установлен", "browser_missing");
}

function browserEnvironment() {
  return Object.fromEntries([
    ["DISPLAY", process.env.DISPLAY],
    ["LANG", process.env.LANG || "C.UTF-8"],
    ["LC_ALL", process.env.LC_ALL],
    ["PATH", process.env.PATH || "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"],
    ["TMPDIR", process.env.TMPDIR || os.tmpdir()],
    ["TZ", process.env.TZ],
  ].filter(([, value]) => typeof value === "string" && value !== ""));
}

async function freeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function stopSpawnedBrowser() {
  if (spawnedBrowser && spawnedBrowser.exitCode === null) spawnedBrowser.kill("SIGTERM");
  spawnedBrowser = null;
  if (spawnedProfile) {
    try {
      rmSync(spawnedProfile, { recursive: true, force: true });
    } catch {
      // Temporary browser profiles are also cleaned by the container/OS.
    }
    spawnedProfile = "";
  }
}

process.once("exit", stopSpawnedBrowser);

async function waitForDevtools(origin, child, childState, stderr, retailerId, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (childState.error) {
      throw renderError(retailerId, `Chromium не запустился${stderr.value ? `: ${stderr.value}` : ""}`, "browser_launch_failed", childState.error);
    }
    if (child.exitCode !== null) {
      throw renderError(retailerId, `Chromium завершился до запуска${stderr.value ? `: ${stderr.value}` : ""}`, "browser_launch_failed");
    }
    try {
      const response = await fetch(`${origin}/json/version`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {
      // Chromium needs a short moment to expose its local DevTools endpoint.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw renderError(retailerId, "Chromium не запустился вовремя", "browser_launch_timeout");
}

async function launchHeadfulBrowser(chromium, executablePath, deadline, retailerId) {
  const port = await beforeDeadline(freeLoopbackPort, deadline, retailerId);
  const origin = `http://127.0.0.1:${port}`;
  spawnedProfile = mkdtempSync(path.join(os.tmpdir(), "rollapp-retailer-chrome-"));
  const runAs = browserSetting("BROWSER_RUN_AS");
  const browserUid = Number.parseInt(browserSetting("BROWSER_UID"), 10);
  const browserGid = Number.parseInt(browserSetting("BROWSER_GID"), 10);
  if (runAs && Number.isSafeInteger(browserUid) && Number.isSafeInteger(browserGid)) {
    chownSync(spawnedProfile, browserUid, browserGid);
  }
  const args = [
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${spawnedProfile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-mode",
    "--disable-component-update",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-sync",
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    "--mute-audio",
    "--window-size=1280,900",
  ];
  if (!runAs && typeof process.getuid === "function" && process.getuid() === 0) args.push("--no-sandbox");
  args.push("about:blank");

  const stderr = { value: "" };
  const childState = { error: null };
  const command = runAs ? "/sbin/su-exec" : executablePath;
  const commandArgs = runAs ? [runAs, executablePath, ...args] : args;
  spawnedBrowser = spawn(command, commandArgs, {
    env: browserEnvironment(),
    stdio: ["ignore", "ignore", "pipe"],
  });
  spawnedBrowser.once("error", (error) => {
    childState.error = error;
  });
  spawnedBrowser.stderr?.on("data", (chunk) => {
    stderr.value = `${stderr.value}${chunk}`.slice(-4_000).trim();
  });

  try {
    await beforeDeadline(
      () => waitForDevtools(origin, spawnedBrowser, childState, stderr, retailerId, Math.min(8_000, remainingDeadlineMs(deadline))),
      deadline,
      retailerId,
    );
    const browser = await beforeDeadline(
      () => chromium.connectOverCDP(origin, { timeout: Math.max(1, remainingDeadlineMs(deadline)) }),
      deadline,
      retailerId,
    );
    const context = browser.contexts()[0];
    if (!context) throw renderError(retailerId, "Chromium не создал профиль", "browser_context_missing");
    return { browser, context, ownsContexts: false };
  } catch (error) {
    stopSpawnedBrowser();
    throw error;
  }
}

async function createBrowserState(deadline, retailerId) {
  if (Date.now() < browserUnavailableUntil) {
    throw renderError(retailerId, "Браузерный импорт временно недоступен", "browser_cooldown");
  }

  try {
    const { chromium } = await import("playwright-core");
    const remoteEndpoint = browserSetting("BROWSER_CDP_URL");
    let state;
    if (remoteEndpoint) {
      const browser = await chromium.connectOverCDP(remoteEndpoint, {
        timeout: Math.max(1, remainingDeadlineMs(deadline)),
      });
      state = { browser, context: null, ownsContexts: true };
    } else {
      const executablePath = browserExecutablePath(retailerId);
      const mode = (browserSetting("BROWSER_MODE") || "auto").toLowerCase();
      const useHeadful = mode === "headful" || (mode === "auto" && process.platform === "linux" && Boolean(process.env.DISPLAY));
      if (useHeadful) {
        state = await launchHeadfulBrowser(chromium, executablePath, deadline, retailerId);
      } else {
        const browser = await chromium.launch({
          executablePath,
          env: browserEnvironment(),
          headless: true,
          timeout: Math.max(1, remainingDeadlineMs(deadline)),
          args: [
            "--disable-dev-shm-usage",
            "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
            ...(typeof process.getuid === "function" && process.getuid() === 0 ? ["--no-sandbox"] : []),
          ],
        });
        state = { browser, context: null, ownsContexts: true };
      }
    }

    return state;
  } catch (error) {
    browserUnavailableUntil = Date.now() + BROWSER_RETRY_DELAY_MS;
    if (error instanceof MetadataFetchError) throw error;
    throw renderError(retailerId, "Не удалось запустить Chromium для импорта товара", "browser_launch_failed", error);
  }
}

function getBrowserState(deadline, retailerId) {
  if (!browserStatePromise) {
    let tracked;
    tracked = createBrowserState(deadline, retailerId)
      .then((state) => {
        state.browser.on("disconnected", () => {
          if (browserStatePromise !== tracked) return;
          browserStatePromise = null;
          stopSpawnedBrowser();
        });
        return state;
      })
      .catch((error) => {
        if (browserStatePromise === tracked) browserStatePromise = null;
        throw error;
      });
    browserStatePromise = tracked;
  }
  return browserStatePromise;
}

function invalidateBrowserState(pendingState) {
  if (!pendingState || browserStatePromise !== pendingState) return;
  browserStatePromise = null;
  stopSpawnedBrowser();
  void pendingState
    .then((state) => settleWithin(() => state.browser.close(), CLEANUP_TIMEOUT_MS))
    .catch(() => {});
}

async function protectBrowserContext(context, retailerId) {
  const alreadyProtected = protectedContexts.has(context);
  protectedContexts.set(context, retailerId);
  if (alreadyProtected) return;
  await context.addInitScript(() => {
    for (const name of ["RTCPeerConnection", "webkitRTCPeerConnection"]) {
      try {
        Object.defineProperty(globalThis, name, {
          configurable: false,
          value: undefined,
          writable: false,
        });
      } catch {
        // The launch policy also disables non-proxied WebRTC traffic.
      }
    }
    const serviceWorkers = navigator.serviceWorker;
    if (!serviceWorkers) return;
    const rejectRegistration = () => Promise.reject(
      new DOMException("Service workers are disabled for metadata rendering", "NotSupportedError"),
    );
    try {
      Object.defineProperty(serviceWorkers, "register", {
        configurable: false,
        value: rejectRegistration,
        writable: false,
      });
    } catch {
      serviceWorkers.register = rejectRegistration;
    }
  });
  await context.route("**/*", async (route) => {
    const currentRetailer = protectedContexts.get(context);
    const requestUrl = route.request().url();
    if (!currentRetailer || !isAllowedRetailerBrowserUrl(currentRetailer, requestUrl)) {
      await route.abort("blockedbyclient");
      return;
    }
    try {
      const url = new URL(requestUrl);
      if (url.protocol === "https:") {
        const now = Date.now();
        let check = browserHostChecks.get(url.hostname);
        if (!check || check.expiresAt <= now) {
          const promise = resolvePublicHost(url).catch((error) => {
            if (browserHostChecks.get(url.hostname)?.promise === promise) browserHostChecks.delete(url.hostname);
            throw error;
          });
          check = { promise, expiresAt: now + 60_000 };
          browserHostChecks.set(url.hostname, check);
        }
        await check.promise;
      }
      await route.continue();
    } catch {
      await route.abort("blockedbyclient");
    }
  });
  if (typeof context.routeWebSocket === "function") {
    await context.routeWebSocket("**/*", (webSocket) => {
      void webSocket.close({ code: 1008, reason: "WebSockets are disabled for metadata rendering" });
    });
  }
}

async function renderWithChromium(url, { deadline, signal, retailerId }) {
  const retailer = retailerProductPolicy(retailerId);
  let statePromise;
  let state;
  let context;
  let page;
  const abortRender = () => {
    invalidateBrowserState(statePromise);
    void page?.close().catch(() => {});
    if (state?.ownsContexts) void context?.close().catch(() => {});
  };
  signal?.addEventListener("abort", abortRender, { once: true });

  try {
    signal?.throwIfAborted();
    statePromise = getBrowserState(deadline, retailerId);
    state = await beforeDeadline(() => statePromise, deadline, retailerId);
    signal?.throwIfAborted();
    if (state.ownsContexts) {
      const contextPromise = state.browser.newContext({
        locale: "ru-RU",
        serviceWorkers: "block",
        viewport: { width: 1280, height: 900 },
      });
      try {
        context = await beforeDeadline(() => contextPromise, deadline, retailerId);
      } catch (error) {
        void contextPromise
          .then((lateContext) => settleWithin(() => lateContext.close(), CLEANUP_TIMEOUT_MS))
          .catch(() => {});
        throw error;
      }
    } else {
      context = state.context;
    }

    await beforeDeadline(() => protectBrowserContext(context, retailerId), deadline, retailerId);
    const pagePromise = context.newPage();
    try {
      page = await beforeDeadline(() => pagePromise, deadline, retailerId);
    } catch (error) {
      void pagePromise
        .then((latePage) => settleWithin(() => latePage.close(), CLEANUP_TIMEOUT_MS))
        .catch(() => {});
      throw error;
    }
    await beforeDeadline(() => page.goto(url.href, {
      waitUntil: "domcontentloaded",
      timeout: Math.max(1, remainingDeadlineMs(deadline)),
    }), deadline, retailerId);
    const challengePattern = retailerId === "samokat" ? INTERACTIVE_CHALLENGE.source : "(?!)";
    const stateHandle = await beforeDeadline(() => page.waitForFunction(
      (challengePattern) => {
        const containsProduct = (value) => {
          if (Array.isArray(value)) return value.some(containsProduct);
          if (!value || typeof value !== "object") return false;
          const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
          if (types.some((type) => typeof type === "string" && /(?:^|[\/#:])Product$/i.test(type))) return true;
          return Object.values(value).some(containsProduct);
        };
        const productFound = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
          .some((script) => {
            try {
              return containsProduct(JSON.parse((script.textContent || "").trim().replace(/;\s*$/, "")));
            } catch {
              return /["']@type["']\s*:\s*["'](?:https?:\/\/schema\.org\/)?Product["']/i.test(script.textContent || "");
            }
          });
        if (productFound) return "product";
        if (new RegExp(challengePattern, "iu").test(document.body?.innerText || "")) return "captcha";
        return false;
      },
      challengePattern,
      { timeout: Math.max(1, remainingDeadlineMs(deadline)) },
    ), deadline, retailerId);
    const pageState = await beforeDeadline(() => stateHandle.jsonValue(), deadline, retailerId);
    await settleWithin(() => stateHandle.dispose(), Math.min(250, remainingDeadlineMs(deadline)));
    if (pageState === "captcha") {
      throw renderError(retailerId, `${retailer.label} запросил интерактивную проверку`, "captcha_required");
    }

    const finalUrl = canonicalRetailerProductUrl(retailerId, page.url());
    if (!isSameRetailerProduct(retailerId, url, finalUrl)) {
      throw renderError(retailerId, `${retailer.label} перенаправил на другую карточку`, "browser_redirected");
    }
    const html = await beforeDeadline(
      () => page.evaluate(() => {
        const productScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
          .map((script) => script.outerHTML)
          .join("");
        return `<head>${document.head?.innerHTML || ""}</head><body>${productScripts}</body>`;
      }),
      deadline,
      retailerId,
    );
    if (!isRetailerProductDocument(html)) {
      throw renderError(retailerId, `${retailer.label} не отдал данные товара`, "product_missing");
    }
    return { html, url: finalUrl };
  } catch (error) {
    if (error instanceof MetadataFetchError && [`${retailerId}_captcha_required`, `${retailerId}_render_timeout`].includes(error.code)) {
      if (error.code === `${retailerId}_captcha_required`) {
        retailerUnavailableUntil.set(retailerId, Date.now() + BROWSER_RETRY_DELAY_MS);
      }
      invalidateBrowserState(statePromise);
    }
    if (error instanceof MetadataFetchError) throw error;
    throw renderError(retailerId, `Не удалось прочитать карточку магазина «${retailer.label}»`, "render_failed", error);
  } finally {
    signal?.removeEventListener("abort", abortRender);
    await settleWithin(
      () => page?.close(),
      CLEANUP_TIMEOUT_MS,
    );
    if (state?.ownsContexts && context) {
      await settleWithin(
        () => context.close(),
        CLEANUP_TIMEOUT_MS,
      );
    }
  }
}

async function acquireRenderSlot(deadline, retailerId) {
  if (activeRenders < 1) {
    activeRenders = 1;
    return;
  }
  if (waitingRenders.length >= MAX_RENDER_QUEUE) {
    throw renderError(retailerId, "Слишком много запросов на импорт товаров", "renderer_busy");
  }
  const timeoutMs = remainingDeadlineMs(deadline);
  if (timeoutMs <= 0) throw renderTimeoutError(retailerId);

  await new Promise((resolve, reject) => {
    const entry = {
      grant() {
        clearTimeout(entry.timer);
        resolve();
      },
      timer: null,
    };
    entry.timer = setTimeout(() => {
      const index = waitingRenders.indexOf(entry);
      if (index >= 0) waitingRenders.splice(index, 1);
      reject(renderTimeoutError(retailerId));
    }, timeoutMs);
    waitingRenders.push(entry);
  });
}

function releaseRenderSlot() {
  const next = waitingRenders.shift();
  if (next) next.grant();
  else activeRenders = 0;
}

async function renderInSlot(url, options) {
  const retailer = retailerProductPolicy(options.retailerId);
  await acquireRenderSlot(options.queueDeadline, options.retailerId);
  const deadline = Date.now() + options.timeoutMs;
  const abortController = new AbortController();
  let operation;
  let releaseAfterOperation = false;
  try {
    operation = Promise.resolve().then(() => options.renderPage(url, {
      ...options,
      deadline,
      signal: abortController.signal,
    }));
    const response = await beforeDeadline(() => operation, deadline, options.retailerId);
    const finalUrl = canonicalRetailerProductUrl(options.retailerId, response?.url);
    if (!isSameRetailerProduct(options.retailerId, url, finalUrl)) {
      throw renderError(options.retailerId, `${retailer.label} перенаправил на другую карточку`, "browser_redirected");
    }
    const html = String(response?.html || "");
    if (!isRetailerProductDocument(html)) {
      throw renderError(options.retailerId, `${retailer.label} не отдал данные товара`, "product_missing");
    }
    return { html, url: finalUrl };
  } catch (error) {
    if (error instanceof MetadataFetchError && error.code === `${options.retailerId}_render_timeout` && operation) {
      abortController.abort(error);
      releaseAfterOperation = true;
      void operation.finally(releaseRenderSlot).catch(() => {});
    }
    throw error;
  } finally {
    if (!releaseAfterOperation) releaseRenderSlot();
  }
}

export async function renderRetailerProductHtml(retailerId, value, {
  timeoutMs = retailerId === "lenta" ? LENTA_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
  renderPage = renderWithChromium,
} = {}) {
  if (!["samokat", "lenta"].includes(retailerId)) {
    throw new TypeError(`Browser rendering is not enabled for retailer: ${retailerId}`);
  }
  if (Date.now() < (retailerUnavailableUntil.get(retailerId) || 0)) {
    throw renderError(retailerId, `Импорт из магазина «${retailerProductPolicy(retailerId).label}» временно недоступен`, "browser_cooldown");
  }
  const url = canonicalRetailerProductUrl(retailerId, value);
  const fallbackTimeout = retailerId === "lenta" ? LENTA_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
  const boundedTimeoutMs = Math.min(25_000, Math.max(2_000, Number(timeoutMs) || fallbackTimeout));
  const queueDeadline = Date.now() + boundedTimeoutMs;
  const jobKey = `${retailerId}:${url.href}`;
  const current = renderJobs.get(jobKey);
  if (current) return current;

  const promise = renderInSlot(url, {
    queueDeadline,
    timeoutMs: boundedTimeoutMs,
    renderPage,
    retailerId,
  })
    .finally(() => {
      if (renderJobs.get(jobKey) === promise) renderJobs.delete(jobKey);
    });
  renderJobs.set(jobKey, promise);
  return promise;
}

export function renderSamokatProductHtml(value, options) {
  return renderRetailerProductHtml("samokat", value, options);
}

export function renderLentaProductHtml(value, options) {
  return renderRetailerProductHtml("lenta", value, options);
}
