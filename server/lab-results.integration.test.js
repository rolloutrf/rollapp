import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

const port = 20_300 + (process.pid % 300);
const baseUrl = `http://127.0.0.1:${port}/api`;

function makeTextPdf(lines) {
  const content = [
    "BT",
    "/F1 12 Tf",
    "72 720 Td",
    ...lines.flatMap((line, index) => [
      ...(index ? ["0 -20 Td"] : []),
      `(${line.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")}) Tj`,
    ]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf);
}

async function waitForServer(child) {
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Test server exited early:\n${output}`);
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {
      // The isolated in-memory server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Test server did not become ready:\n${output}`);
}

async function login(email) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234" }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

test("lab reports can be deleted by their owner and stay removed", async (t) => {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DEMO_MODE: "true",
      DEFAULT_FRIEND_USERNAME: "alisa",
      DATABASE_URL: "",
      PGHOST: "",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(child);

  const ownerCookie = await login("demo@rollapp.test");
  const visitorCookie = await login("max@rollapp.test");
  // Match a built-in report date so the test covers deleting a merged tab,
  // including its uploaded PDF and its persisted built-in fallback.
  const uploadedPdf = makeTextPdf(["15.07.2026", "hematocrit 42.5 % 39-49"]);
  const secondUploadedPdf = makeTextPdf(["15.07.2026", "hematocrit 43.0 % 39-49"]);
  const upload = await fetch(`${baseUrl}/health/lab-results/uploads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf",
      "X-File-Name": encodeURIComponent("lab-result.pdf"),
      Cookie: ownerCookie,
    },
    body: uploadedPdf,
  });
  assert.equal(upload.status, 201);
  const uploadedReport = (await upload.json()).report;
  assert.equal(uploadedReport.date, "2026-07-15");
  assert.match(uploadedReport.source.uploadId, /^[0-9a-f-]{36}$/u);

  const secondUpload = await fetch(`${baseUrl}/health/lab-results/uploads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf",
      "X-File-Name": encodeURIComponent("lab-result-second.pdf"),
      Cookie: ownerCookie,
    },
    body: secondUploadedPdf,
  });
  assert.equal(secondUpload.status, 201);

  const initialResponse = await fetch(`${baseUrl}/health/lab-results`, { headers: { Cookie: ownerCookie } });
  assert.equal(initialResponse.status, 200);
  const initialReports = (await initialResponse.json()).reports;
  assert.ok(initialReports.length > 0);
  const target = initialReports[0];
  assert.equal(target.id, uploadedReport.id);
  const uploadedSources = target.sources.filter((source) => source.uploadId);
  assert.equal(uploadedSources.length, 2);
  const targetUrl = `${baseUrl}/health/lab-results/${encodeURIComponent(target.id)}`;
  const uploadedPdfUrls = uploadedSources.map(
    (source) => `${baseUrl}/health/lab-results/uploads/${source.uploadId}/pdf`,
  );

  const anonymousDelete = await fetch(targetUrl, { method: "DELETE" });
  assert.equal(anonymousDelete.status, 401);
  const visitorDelete = await fetch(targetUrl, { method: "DELETE", headers: { Cookie: visitorCookie } });
  assert.equal(visitorDelete.status, 403);

  const deleted = await fetch(targetUrl, { method: "DELETE", headers: { Cookie: ownerCookie } });
  assert.equal(deleted.status, 200);
  assert.match(deleted.headers.get("cache-control") || "", /private/u);
  const deletedPayload = await deleted.json();
  assert.equal(deletedPayload.ok, true);
  assert.equal(deletedPayload.reports.some((report) => report.date === target.date), false);
  assert.equal(
    deletedPayload.trends.some((trend) => trend.points.some((point) => point.date === "15.07.26")),
    false,
  );
  for (const pdfUrl of uploadedPdfUrls) {
    const deletedPdf = await fetch(pdfUrl, { headers: { Cookie: ownerCookie } });
    assert.equal(deletedPdf.status, 404);
  }

  const refreshed = await fetch(`${baseUrl}/health/lab-results`, { headers: { Cookie: ownerCookie } });
  assert.equal(refreshed.status, 200);
  assert.equal((await refreshed.json()).reports.some((report) => report.date === target.date), false);

  const repeatedDelete = await fetch(targetUrl, { method: "DELETE", headers: { Cookie: ownerCookie } });
  assert.equal(repeatedDelete.status, 404);

  const repeatedUpload = await fetch(`${baseUrl}/health/lab-results/uploads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf",
      "X-File-Name": encodeURIComponent("lab-result.pdf"),
      Cookie: ownerCookie,
    },
    body: uploadedPdf,
  });
  assert.equal(repeatedUpload.status, 201);
  const restoredReport = (await repeatedUpload.json()).report;
  assert.equal(restoredReport.date, target.date);
  const removeRestored = await fetch(
    `${baseUrl}/health/lab-results/${encodeURIComponent(restoredReport.id)}`,
    { method: "DELETE", headers: { Cookie: ownerCookie } },
  );
  assert.equal(removeRestored.status, 200);

  let remainingReports = (await removeRestored.json()).reports;
  for (const report of remainingReports) {
    const response = await fetch(
      `${baseUrl}/health/lab-results/${encodeURIComponent(report.id)}`,
      { method: "DELETE", headers: { Cookie: ownerCookie } },
    );
    assert.equal(response.status, 200);
    remainingReports = (await response.json()).reports;
  }
  assert.equal(remainingReports.length, 0);

  const emptyHistory = await fetch(`${baseUrl}/health/lab-results`, { headers: { Cookie: ownerCookie } });
  assert.equal(emptyHistory.status, 200);
  const emptyPayload = await emptyHistory.json();
  assert.deepEqual(emptyPayload.reports, []);
  assert.deepEqual(emptyPayload.trends, []);
  assert.deepEqual(emptyPayload.attentionItems, []);
});
