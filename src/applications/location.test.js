import assert from "node:assert/strict";
import test from "node:test";
import { PLATFORM_HOST, SPHERE_APPLICATIONS } from "../../shared/applications.js";
import { applicationRedirect, platformLink, sphereLink } from "./location.js";

test("sphere roots, deep links and service switches keep the destination query and anchor", () => {
  for (const [application, { host, home }] of Object.entries(SPHERE_APPLICATIONS)) {
    const state = { application, hostname: host, pathname: "/", search: "?tab=detail", hash: "#section" };
    const path = `${home}${state.search}${state.hash}`;
    assert.equal(applicationRedirect(state), path);
    assert.equal(applicationRedirect({ ...state, pathname: home }), null);
    assert.equal(applicationRedirect({ ...state, pathname: home, hostname: PLATFORM_HOST, application: null }), `https://${host}${path}`);
    assert.equal(applicationRedirect({ ...state, pathname: home, hostname: PLATFORM_HOST, application: null, telegram: true }), null);
    assert.equal(sphereLink(path, { hostname: PLATFORM_HOST }), `https://${host}${path}`);
    assert.equal(sphereLink(path, { hostname: "localhost" }), path);
    assert.equal(platformLink("/app/planning", { hostname: host }), `https://${PLATFORM_HOST}/app/planning`);
    assert.equal(applicationRedirect({ ...state, pathname: "/login", search: `?next=${encodeURIComponent(path)}`, hash: "" }),
      `https://${PLATFORM_HOST}/api/auth/sphere-session?next=${encodeURIComponent(path)}`);
  }
});
