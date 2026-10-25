import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { deployVmMetadata, renderDeploymentCompose } from "./deploy-vm-metadata.mjs";

const version = "a".repeat(40);
const config = { vmId: "vm1", folderId: "folder1", runtimeSaId: "runtime1", token: "DO-NOT-LOG-TOKEN", version, image: `cr.yandex/registry/rollapp:${version}` };
const compose = `services:\n  app:\n    image: "${config.image}"\n    environment:\n      APP_VERSION: "${version}"\n`;
const instance = metadata => ({ id: "vm1", folderId: "folder1", status: "RUNNING", serviceAccountId: "runtime1", metadataOptions: { gceHttpEndpoint: "ENABLED", gceHttpToken: "ENABLED" }, metadata: { "user-data": "DO-NOT-LOG-USER-DATA", "docker-compose": "rollback", ...metadata } });
function fixture(responses) {
  const calls = [];
  return { calls, options: { delay: async () => {}, fetch: async (url, options) => {
    calls.push({ url, ...options });
    assert(responses.length, "Unexpected cloud request");
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return response?.httpError ? { ok: false, status: response.httpError, json: async () => assert.fail("Never read an error body") } : { ok: true, json: async () => response };
  } } };
}

test("metadata deploy upserts only Compose, polls its exact operation and verifies FULL VM metadata", async () => {
  const f = fixture([instance(), { id: "op1", done: false }, { id: "op1", done: true, response: {} }, instance({ "docker-compose": compose })]);
  assert.deepEqual(await deployVmMetadata(config, compose, f.options), { version });
  assert.deepEqual(f.calls.map(({ method }) => method), ["GET", "POST", "GET", "GET"]);
  assert.equal(f.calls[0].url, "https://compute.api.cloud.yandex.net/compute/v1/instances/vm1?view=FULL");
  assert.equal(f.calls[2].url, "https://operation.api.cloud.yandex.net/operations/op1");
  assert.deepEqual(JSON.parse(f.calls[1].body), { upsert: { "docker-compose": compose } });
  assert(f.calls.every(call => call.headers.Authorization === `Bearer ${config.token}` && call.redirect === "error" && call.signal instanceof AbortSignal));
});

test("every identity, metadata access and conflicting-container guard fails before any write", async () => {
  for (const change of [
    { id: "other" }, { folderId: "other" }, { status: "STOPPED" }, { serviceAccountId: "other" },
    { metadataOptions: {} }, { metadataOptions: { gceHttpEndpoint: "DISABLED", gceHttpToken: "ENABLED" } },
    { metadataOptions: { gceHttpEndpoint: "ENABLED", gceHttpToken: "DISABLED" } },
    { metadata: null }, { metadata: [] }, { metadata: { foo: 1 } }, { metadata: { "docker-container-declaration": "conflict" } },
  ]) {
    const f = fixture([{ ...instance(), ...change }]);
    await assert.rejects(deployVmMetadata(config, compose, f.options), /unexpected or conflicting/);
    assert.deepEqual(f.calls.map(call => call.method), ["GET"]);
  }
});

test("invalid config, mutable tag and wrong version fail without even reading the VM", async () => {
  for (const change of [{ token: "" }, { token: "secret\nheader" }, { vmId: "../../another-vm" }, { folderId: "" }, { runtimeSaId: "" }, { image: "cr.yandex/registry/rollapp:latest" }, { version: "b".repeat(40) }]) {
    const f = fixture([]);
    await assert.rejects(deployVmMetadata({ ...config, ...change }, compose, f.options), /Invalid deployment/);
    assert.equal(f.calls.length, 0);
  }
  for (const body of ["", compose.replace(version, "b".repeat(40)), compose + "__IMAGE__"]) {
    const f = fixture([]);await assert.rejects(deployVmMetadata(config, body, f.options), /Compose/);assert.equal(f.calls.length, 0);
  }
});

test("operation failure, wrong operation and polling exhaustion never stop/restart/retry a mutation", async () => {
  for (const result of [{ id: "op1", done: true, error: { message: "DO-NOT-LOG-TOKEN" } }, { id: "../../other", done: true }, { id: "op1", done: "yes" }]) {
    const f = fixture([instance(), result]);await assert.rejects(deployVmMetadata(config, compose, f.options));
    assert.equal(f.calls.filter(c => c.method === "POST").length, 1);
  }
  const changed = fixture([instance(), { id: "op1", done: false }, { id: "other", done: true }]);
  await assert.rejects(deployVmMetadata(config, compose, changed.options), /identity changed/);
  const stuck = fixture([instance(), { id: "op1", done: false }, { id: "op1", done: false }]);
  await assert.rejects(deployVmMetadata(config, compose, { ...stuck.options, pollLimit: 1 }), /polling limit/);
});

test("verification rejects a changed identity, stale Compose or loss of unrelated metadata", async () => {
  for (const after of [instance(), { ...instance({ "docker-compose": compose }), id: "other" }, instance({ "docker-compose": compose, "user-data": "changed" })]) {
    const f = fixture([instance(), { id: "op1", done: true, response: {} }, after]);
    await assert.rejects(deployVmMetadata(config, compose, f.options));
    assert.equal(f.calls.filter(c => c.method === "POST").length, 1);
  }
});

test("transport/HTTP errors fail closed without leaking token, metadata or API response bodies", async () => {
  for (const response of [new Error("DO-NOT-LOG-TOKEN DO-NOT-LOG-USER-DATA"), { httpError: 403 }, { httpError: 502 }]) {
    const f = fixture([instance(), response]);
    await assert.rejects(deployVmMetadata(config, compose, f.options), error => !/DO-NOT-LOG/.test(error.message));
    assert.equal(f.calls.filter(c => c.method === "POST").length, 1);
  }
});

test("real deployment template renders exact SHA without changing other content", async () => {
  const template = await readFile(new URL("../deploy/docker-compose.template.yml", import.meta.url), "utf8");
  const rendered = renderDeploymentCompose(template, config);
  assert.equal(rendered, template.replaceAll("__IMAGE__", config.image).replaceAll("__VERSION__", version));
  assert.throws(() => renderDeploymentCompose("no placeholders", config));
});

test("ordinary production releases verify the existing schema instead of migrating or cleaning reservations", async () => {
  const template = await readFile(new URL("../deploy/docker-compose.template.yml", import.meta.url), "utf8");
  const rendered = renderDeploymentCompose(template, config);
  assert.match(rendered, /^      ROLLAPP_DATABASE_INITIALIZATION: "verify"$/m);
  assert.match(rendered, /^      DEMO_MODE: "false"$/m);
  assert.doesNotMatch(rendered, /^      (?:ROLLAPP_DATABASE_INITIALIZATION: "migrate"|SEED_DEMO: "true")$/m);
});

test("protobuf-JSON omitted false defaults are polled, never treated as success", async () => {
  const f = fixture([instance(), { id: "op1" }, { id: "op1", done: true, response: {} }, instance({ "docker-compose": compose })]);
  await deployVmMetadata(config, compose, f.options);
  assert.equal(f.calls[2].url, "https://operation.api.cloud.yandex.net/operations/op1");
});

test("check-only performs exactly one verified FULL read, no write or operation polling", async () => {
  const f = fixture([instance()]);
  assert.deepEqual(await deployVmMetadata(config, compose, { ...f.options, checkOnly: true }), { checked: true, version });
  assert.equal(f.calls.length, 1);assert.equal(f.calls[0].method, "GET");
});

test("workflow retains complete release gate, OIDC, serialized rollout and exact production health checks", async () => {
  const workflow = await readFile(new URL("../.github/workflows/deploy-yandex-cloud.yml", import.meta.url), "utf8");
  assert.match(workflow, /run: npm run check:release/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /run: node scripts\/deploy-vm-metadata\.mjs/);
  assert(workflow.indexOf('run: npm run check:release') < workflow.indexOf('run: node scripts/deploy-vm-metadata.mjs'));
  assert.match(workflow, /\.ok == true and \.version == \$expected/);
  assert.match(workflow, /keeping the running service available/);
  assert.doesNotMatch(workflow, /Install pinned Yandex Cloud CLI|yc compute instance (?:restart|stop|delete)|--max-time 120/);
  assert.match(workflow, /YC_LOCKBOX_SOURCE: iam/);
  assert.doesNotMatch(workflow, /YC_LOCKBOX_SOURCE: cli/);
});

test("targeted snippet releases require an explicit manual choice and retain control geometry checks", async () => {
  const workflow = await readFile(new URL("../.github/workflows/deploy-yandex-cloud.yml", import.meta.url), "utf8");
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(workflow, /options: \[full, snippets, identity-reports, none\]\s+default: full/);
  assert.match(workflow, /name: Install WebKit for native time field checks\s+if: github.event_name != 'workflow_dispatch' \|\| inputs.verification == 'full'/);
  assert(workflow.includes("if: github.event_name != 'workflow_dispatch' || inputs.verification == 'full'"));
  assert.match(workflow, /name: Verify targeted snippet release\s+if: github.event_name == 'workflow_dispatch' && inputs.verification == 'snippets'\s+run: npm run check:release:snippets/);
  assert(workflow.indexOf('run: npm run check:release:snippets') < workflow.indexOf('run: node scripts/deploy-vm-metadata.mjs'));
  for (const command of ['test:unit', 'test:ui', 'test:controls', 'test:snippets', 'test:drag-drop', 'build']) {
    assert(packageJson.scripts['check:release:snippets'].split(' && ').includes(`npm run ${command}`));
  }
  assert.match(workflow, /name: Verify targeted identity report release\s+if: github.event_name == 'workflow_dispatch' && inputs.verification == 'identity-reports'\s+run: npm run check:release:identity-reports/);
  assert(workflow.indexOf('run: npm run check:release:identity-reports') < workflow.indexOf('run: node scripts/deploy-vm-metadata.mjs'));
  for (const command of ['test:unit', 'test:ui', 'test:controls', 'test:identity-reports', 'test:form-actions', 'test:action-rails', 'test:page-scrollers', 'build']) {
    assert(packageJson.scripts['check:release:identity-reports'].split(' && ').includes(`npm run ${command}`));
  }
});

test("manual branch audits run the full matrix without production deployment or cloud credentials", async () => {
  const workflow = await readFile(new URL("../.github/workflows/deploy-yandex-cloud.yml", import.meta.url), "utf8");
  assert(workflow.includes("group: ${{ github.ref == 'refs/heads/main' && 'rollapp-production-deploy' || format('rollapp-ui-audit-{0}', github.ref) }}"), "Read-only branch audits must not occupy the serialized production deployment queue");
  const audit = workflow.split("  audit:\n")[1].split("  deploy:\n")[0];
  assert.match(audit, /if: github.event_name == 'workflow_dispatch' && github.ref != 'refs\/heads\/main'/);
  assert.match(audit, /permissions:\s+contents: read\s+steps:/);
  assert.match(audit, /set -euo pipefail/);
  assert.match(audit, /npm run check:comprehensive/);
  assert.match(audit, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(audit, /id-token: write|yc-actions|docker push|deploy-vm-metadata/);
  assert.match(workflow, /  deploy:\s+if: github.ref == 'refs\/heads\/main'/);
});
