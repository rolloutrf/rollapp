import assert from "node:assert/strict";
import { test } from "node:test";
import { createRateLimit } from "./rate-limit.js";

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

function request(middleware, req) {
  const res = responseRecorder();
  let allowed = false;
  middleware(req, res, () => { allowed = true; });
  return { allowed, res };
}

test("can limit marketplace refreshes independently per user and wish", () => {
  let currentTime = 1_000;
  const middleware = createRateLimit({
    windowMs: 60_000,
    max: 1,
    key: (req) => `${req.user.id}:${req.params.id}`,
    code: "marketplace_offers_rate_limited",
    now: () => currentTime,
  });
  const firstWish = { ip: "127.0.0.1", user: { id: "user-1" }, params: { id: "wish-1" } };
  const secondWish = { ...firstWish, params: { id: "wish-2" } };

  assert.equal(request(middleware, firstWish).allowed, true);
  assert.equal(request(middleware, secondWish).allowed, true);

  const limited = request(middleware, firstWish);
  assert.equal(limited.allowed, false);
  assert.equal(limited.res.statusCode, 429);
  assert.equal(limited.res.body.code, "marketplace_offers_rate_limited");
  assert.equal(limited.res.body.retryAfterSeconds, 60);
  assert.equal(limited.res.headers["Retry-After"], "60");

  currentTime += 60_000;
  assert.equal(request(middleware, firstWish).allowed, true);
});
