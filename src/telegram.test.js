import assert from "node:assert/strict";
import test from "node:test";
import { loadTelegramWebAppSdk, shouldLoadTelegramWebAppSdk } from "./telegram.js";

test("Telegram SDK is omitted from password reset routes", async () => {
  assert.equal(shouldLoadTelegramWebAppSdk("/reset-password"), false);
  assert.equal(shouldLoadTelegramWebAppSdk("/reset-password/"), false);
  assert.equal(shouldLoadTelegramWebAppSdk("/login"), true);

  let appended = false;
  await loadTelegramWebAppSdk({
    windowRef: { location: { pathname: "/reset-password" } },
    documentRef: {
      createElement: () => { throw new Error("Reset pages must not create the Telegram script"); },
      head: { appendChild: () => { appended = true; } },
    },
  });
  assert.equal(appended, false);
});

test("Telegram SDK still loads before the app on ordinary routes", async () => {
  let appendedScript;
  const documentRef = {
    createElement: () => {
      const listeners = new Map();
      return {
        addEventListener: (name, callback) => listeners.set(name, callback),
        dispatch: (name) => listeners.get(name)?.(),
      };
    },
    head: {
      appendChild: (script) => {
        appendedScript = script;
        queueMicrotask(() => script.dispatch("load"));
      },
    },
  };
  await loadTelegramWebAppSdk({
    windowRef: { location: { pathname: "/login" } },
    documentRef,
  });
  assert.equal(appendedScript.src, "https://telegram.org/js/telegram-web-app.js");
  assert.equal(appendedScript.async, true);
});
