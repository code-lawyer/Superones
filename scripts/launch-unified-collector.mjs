import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";

const [pythonPath, outputDirectory] = process.argv.slice(2);
if (!pythonPath || !outputDirectory) {
  throw new Error("Usage: node scripts/launch-unified-collector.mjs <python-path> <output-directory>");
}

const target = path.resolve(outputDirectory);
mkdirSync(target, { recursive: true });
const stdoutPath = path.join(target, "run.stdout.log");
const stderrPath = path.join(target, "run.stderr.log");
const stdout = openSync(stdoutPath, "a");
const stderr = openSync(stderrPath, "a");
const environment = {};
for (const [key, value] of Object.entries(process.env)) {
  if (value === undefined) continue;
  if (key.toLowerCase() === "path") {
    if (!environment.PATH) environment.PATH = value;
  } else {
    environment[key] = value;
  }
}
environment.VAULT2077_PYTHON = path.resolve(pythonPath);
environment.VAULT2077_COLLECTOR_OUTPUT_DIR = target;

const child = spawn(process.execPath, [
  "--conditions=react-server",
  "--experimental-strip-types",
  "scripts/collect-unified-acquisition.ts",
], {
  cwd: process.cwd(),
  env: environment,
  detached: true,
  windowsHide: true,
  stdio: ["ignore", stdout, stderr],
});
child.unref();
closeSync(stdout);
closeSync(stderr);
console.log(JSON.stringify({
  pid: child.pid,
  runDirectory: target,
  stdout: stdoutPath,
  stderr: stderrPath,
}));
