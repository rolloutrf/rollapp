import assert from "node:assert/strict";
import { test } from "node:test";
import { getSmsConfig, resetSmsTokenCacheForTests, sendSms, SmsDeliveryError } from "./sms.js";

test("test SMS provider is impossible outside NODE_ENV=test", async () => {
  assert.deepEqual(getSmsConfig({ SMS_PROVIDER: "test", NODE_ENV: "production" }), {
    provider: "disabled",
    enabled: false,
    testMode: false,
  });
  await assert.rejects(
    sendSms({ phone: "+79991234567", code: "123456" }, {
      env: { SMS_PROVIDER: "test", NODE_ENV: "production" },
    }),
    SmsDeliveryError,
  );
  const result = await sendSms({ phone: "+79991234567", code: "123456" }, {
    env: { SMS_PROVIDER: "test", NODE_ENV: "test" },
  });
  assert.match(result.providerMessageId, /^test-/);
});

test("Yandex provider uses VM IAM token and form-encoded CNS Publish request", async () => {
  resetSmsTokenCacheForTests();
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) {
      return new Response(JSON.stringify({ access_token: "iam-token", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      PublishResponse: { PublishResult: { MessageId: "message-1" } },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const result = await sendSms({ phone: "+79991234567", code: "123456" }, {
    env: {
      SMS_PROVIDER: "yandex",
      NODE_ENV: "production",
      YC_CNS_SENDER_ID: "Rollapp",
    },
    fetchImpl,
  });
  assert.deepEqual(result, { providerMessageId: "message-1" });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers["Metadata-Flavor"], "Google");
  assert.equal(calls[1].options.headers.Authorization, "Bearer iam-token");
  const body = calls[1].options.body;
  assert.equal(body.get("Action"), "Publish");
  assert.equal(body.get("PhoneNumber"), "+79991234567");
  assert.match(body.get("Message"), /123456/);
  assert.equal(body.get("MessageAttributes.entry.1.key"), "AWS.SNS.SMS.SMSType");
  assert.equal(body.get("MessageAttributes.entry.2.key"), "AWS.SNS.SMS.SenderID");
});

