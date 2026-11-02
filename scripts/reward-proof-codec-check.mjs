import "dotenv/config";
import dotenv from "dotenv";
import { spawnSync } from "node:child_process";
dotenv.config({ path: ".env.local", override: false, quiet: true });
const python = process.env.ROLLAPP_OTS_PYTHON || "/opt/rollapp-ots/bin/python";
const result = spawnSync(python, ["server/reward-proof-codec-test.py"], {
  stdio: "inherit", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1" },
});
if (result.error) console.error("OpenTimestamps runtime unavailable; install server/requirements/opentimestamps.txt in a venv and set ROLLAPP_OTS_PYTHON.");
process.exitCode = result.status ?? 1;
