import { execFileSync, spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const root = path.resolve(import.meta.dirname, "..");
const checks = ["check:release", "test:navigation", "test:action-rails", "test:identity-reports", "test:todo", "test:form-pages", "test:catalog-page", "test:wish-groups", "test:drawers", "test:contacts"];
if (process.argv.includes("--list")) {
  console.log(checks.join("\n"));
} else {
  const startedAt = new Date().toISOString();
  const output = path.resolve(process.env.ROLLAPP_CHECK_OUTPUT || path.join(os.tmpdir(), `rollapp-check-${Date.now()}.json`));
  const env = { ...process.env };
  // A comprehensive result must never silently inherit a partial smoke matrix.
  for (const key of ["CALENDAR_WIDTHS", "CONTROL_WIDTHS", "DETAIL_WIDTHS", "DATE_WIDTHS", "FORM_ACTION_WIDTHS", "FORM_ACTION_CASES", "TEXT_EDIT_WIDTHS", "ACTION_WIDTHS", "TODO_WIDTHS", "FORM_WIDTHS", "FORM_CASES", "DRAWER_WIDTHS", "DRAWER_MODES", "DRAWER_CASES"]) delete env[key];
  const report = {
    status: "running",
    startedAt,
    commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()),
    node: process.version,
    checks: checks.map((name) => ({ name, status: "not-run" })),
  };
  console.log(`Comprehensive checks: database-free; full matrices. Report: ${output}`);
  for (const check of report.checks) {
    check.status = "running";
    check.startedAt = new Date().toISOString();
    await writeFile(output, JSON.stringify(report, null, 2) + "\n");
    const started = Date.now();
    const code = await new Promise((resolve) => {
      const child = spawn("npm", ["run", check.name], { cwd: root, env, stdio: "inherit" });
      child.on("error", (error) => { console.error(error.message); resolve(1); });
      child.on("exit", (exitCode) => resolve(exitCode ?? 1));
    });
    Object.assign(check, { status: code === 0 ? "passed" : "failed", exitCode: code, finishedAt: new Date().toISOString(), durationMs: Date.now() - started });
    await writeFile(output, JSON.stringify(report, null, 2) + "\n");
    if (code !== 0) { process.exitCode = code; break; }
  }
  report.status = process.exitCode ? "failed" : "passed";
  report.finishedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(`Comprehensive checks ${process.exitCode ? "FAILED" : "PASSED"}. Report: ${output}`);
}
