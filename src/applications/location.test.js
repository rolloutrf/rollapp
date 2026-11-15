import { localizedPageUrl } from "../../shared/page-urls.js";
import assert from "node:assert/strict";
import test from "node:test";
import { PLATFORM_HOST, SPHERE_APPLICATIONS } from "../../shared/applications.js";
import { applicationRedirect, platformLink, sharePageUrl, sphereLink } from "./location.js";

test("sphere roots, deep links and service switches keep the destination query and anchor", () => {
  for (const [application, { host, home }] of Object.entries(SPHERE_APPLICATIONS)) {
    const state = { application, hostname: host, pathname: "/", search: "?tab=detail", hash: "#section" };
    const path = `${home}${state.search}${state.hash}`;
    assert.equal(applicationRedirect(state), localizedPageUrl(path));
    assert.equal(applicationRedirect({ ...state, pathname: home }), null);
    assert.equal(applicationRedirect({ ...state, pathname: home, hostname: PLATFORM_HOST, application: null }), `https://${host}${localizedPageUrl(path)}`);
    assert.equal(applicationRedirect({ ...state, pathname: home, hostname: PLATFORM_HOST, application: null, telegram: true }), null);
    assert.equal(sphereLink(path, { hostname: PLATFORM_HOST }), `https://${host}${localizedPageUrl(path)}`);
    assert.equal(sphereLink(path, { hostname: "localhost" }), path);
    assert.equal(platformLink("/app/planning", { hostname: host }), `https://${PLATFORM_HOST}${localizedPageUrl("/app/planning")}`);
    assert.equal(applicationRedirect({ ...state, pathname: "/login", search: `?next=${encodeURIComponent(path)}`, hash: "" }),
      `https://${PLATFORM_HOST}/api/auth/sphere-session?next=${encodeURIComponent(path)}`);
  }
});

test("copied links resolve to the right host and keep the account name", () => {
  const host = SPHERE_APPLICATIONS.wishlist.host;
  const location = { hostname: host, origin: `https://${host}` };
  assert.equal(decodeURI(sharePageUrl("/gordeev/calendar/book", location)),
    `https://${PLATFORM_HOST}/gordeev/календарь/запись`);
  assert.equal(decodeURI(sharePageUrl("/app/spheres/health?tab=sleep&owner=gordeev", location)),
    `https://${SPHERE_APPLICATIONS.health.host}/приложение/сферы/здоровье?раздел=сон&владелец=gordeev`);
  assert.equal(decodeURI(sharePageUrl("/s/opaque-token", location)),
    `https://${host}/поделиться/opaque-token`);
});
