import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  EmailDeliveryError,
  getEmailConfig,
  resetEmailTokenCacheForTests,
  sendPasswordResetEmail,
} from "./email.js";

const resetPayload = {
  to: "user@example.com",
  resetUrl: "https://xn--80avakiab.xn--p1ai/reset-password#token=secret-token",
  requestId: "request-1",
};

test("email provider modes cannot expose development delivery in production", () => {
  assert.deepEqual(getEmailConfig({ EMAIL_PROVIDER: "console", NODE_ENV: "production" }), {
    provider: "disabled",
    enabled: false,
    testMode: false,
  });
  assert.deepEqual(getEmailConfig({ EMAIL_PROVIDER: "test", NODE_ENV: "production" }), {
    provider: "disabled",
    enabled: false,
    testMode: false,
  });
  assert.deepEqual(getEmailConfig({ EMAIL_PROVIDER: "console", NODE_ENV: "development" }), {
    provider: "console",
    enabled: true,
    testMode: false,
  });
  assert.deepEqual(getEmailConfig({ EMAIL_PROVIDER: "test", NODE_ENV: "test" }), {
    provider: "test",
    enabled: true,
    testMode: true,
  });
  assert.deepEqual(getEmailConfig({ EMAIL_PROVIDER: "yandex", NODE_ENV: "production" }), {
    provider: "yandex",
    enabled: false,
    testMode: false,
  });
  assert.deepEqual(getEmailConfig({
    EMAIL_PROVIDER: "yandex",
    EMAIL_FROM: "Rollapp <no-reply@example.com>",
    NODE_ENV: "production",
  }), {
    provider: "yandex",
    enabled: true,
    testMode: false,
  });
  assert.deepEqual(getEmailConfig({}), {
    provider: "disabled",
    enabled: false,
    testMode: false,
  });
  assert.deepEqual(getEmailConfig({
    EMAIL_PROVIDER: "console",
    NODE_ENV: "development",
    PGHOST: "db.example",
  }), {
    provider: "disabled",
    enabled: false,
    testMode: false,
  });
  assert.deepEqual(getEmailConfig({
    EMAIL_PROVIDER: "test",
    NODE_ENV: "test",
    DATABASE_URL: "postgres://db.example/rollapp",
  }), {
    provider: "disabled",
    enabled: false,
    testMode: false,
  });
});

test("test provider writes one JSON line to the explicit outbox", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "rollapp-email-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const outboxPath = path.join(directory, "outbox.jsonl");

  const result = await sendPasswordResetEmail(resetPayload, {
    env: {
      EMAIL_PROVIDER: "test",
      NODE_ENV: "test",
      EMAIL_TEST_OUTBOX_PATH: outboxPath,
    },
  });

  assert.deepEqual(result, { providerMessageId: "test-request-1" });
  const lines = (await readFile(outboxPath, "utf8")).trim().split("\n");
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    type: "password-reset",
    to: resetPayload.to,
    resetUrl: resetPayload.resetUrl,
    requestId: resetPayload.requestId,
  });
});

test("Yandex provider obtains a VM IAM token and sends Russian text and HTML", async () => {
  resetEmailTokenCacheForTests();
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) {
      return new Response(JSON.stringify({ access_token: "iam-token", expires_in: 3_600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ MessageId: "postbox-message-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await sendPasswordResetEmail(resetPayload, {
    env: {
      EMAIL_PROVIDER: "yandex",
      NODE_ENV: "production",
      EMAIL_FROM: "Rollapp <no-reply@example.com>",
    },
    fetchImpl,
  });

  assert.deepEqual(result, { providerMessageId: "postbox-message-1" });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token");
  assert.equal(calls[0].options.headers["Metadata-Flavor"], "Google");
  assert.equal(calls[1].url, "https://postbox.cloud.yandex.net/v2/email/outbound-emails");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.headers["X-YaCloud-SubjectToken"], "iam-token");

  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.FromEmailAddress, "Rollapp <no-reply@example.com>");
  assert.deepEqual(body.Destination.ToAddresses, [resetPayload.to]);
  assert.match(body.Content.Simple.Subject.Data, /Rollapp/);
  assert.match(body.Content.Simple.Body.Text.Data, /восстановление пароля/i);
  assert.match(body.Content.Simple.Body.Text.Data, /secret-token/);
  assert.match(body.Content.Simple.Body.Html.Data, /Задать новый пароль/);
  assert.match(body.Content.Simple.Body.Html.Data, /secret-token/);
});

test("disabled delivery and invalid Yandex configuration fail closed", async () => {
  await assert.rejects(
    sendPasswordResetEmail(resetPayload, {
      env: { EMAIL_PROVIDER: "test", NODE_ENV: "production" },
    }),
    EmailDeliveryError,
  );
  await assert.rejects(
    sendPasswordResetEmail(resetPayload, {
      env: { EMAIL_PROVIDER: "yandex", NODE_ENV: "production" },
    }),
    /EMAIL_FROM/,
  );
});
