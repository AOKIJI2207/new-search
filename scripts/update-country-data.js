import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const LOGS_DIR = path.join(process.cwd(), "logs");
const REPORT_PATH = path.join(LOGS_DIR, "update-country-data-report.json");

function runStep(command, args) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env
  });

  return {
    command: [command, ...args].join(" "),
    startedAt,
    finishedAt: new Date().toISOString(),
    status: result.status === 0 ? "ok" : "failed",
    exitCode: result.status ?? 1
  };
}

const steps = [];
steps.push(runStep("node", ["scripts/validate-country-dataset.mjs"]));

const generationStep = runStep("node", ["scripts/generate-country-profiles.mjs"]);
steps.push(generationStep);

const finalValidation = runStep("node", ["scripts/validate-country-dataset.mjs"]);
steps.push(finalValidation);

const hasFailure = steps[0].exitCode !== 0 || finalValidation.exitCode !== 0;
const report = {
  generatedAt: new Date().toISOString(),
  status: hasFailure ? "failed" : "success",
  summary: hasFailure
    ? "Dataset update failed because validation did not pass."
    : generationStep.exitCode === 0
      ? "Dataset checked, regenerated, and revalidated successfully."
      : "Dataset remained valid, but regeneration reported an external-source warning.",
  steps
};

fs.mkdirSync(LOGS_DIR, { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

if (hasFailure) {
  process.exit(1);
}
