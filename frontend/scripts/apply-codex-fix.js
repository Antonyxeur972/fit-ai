#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const repoRoot = path.resolve(__dirname, "../..");
const patchDir = path.join(repoRoot, ".codex-patches");
const patchPath = path.join(patchDir, "fix-workout-flow.patch");
const packagePath = path.join(repoRoot, "frontend", "package.json");
const scriptPath = __filename;
const postinstallCommand = "node ./scripts/apply-codex-fix.js";

function run(command, args, options = {}) {
  return cp.execFileSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    ...options,
  });
}

function removePostinstall() {
  if (!fs.existsSync(packagePath)) return;
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  if (pkg.scripts && pkg.scripts.postinstall === postinstallCommand) {
    delete pkg.scripts.postinstall;
    fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
}

function buildPatchFromParts() {
  if (!fs.existsSync(patchDir)) return false;
  const parts = fs
    .readdirSync(patchDir)
    .filter((name) => name.startsWith("fix-workout-flow.patch.part-"))
    .sort();
  if (!parts.length) return false;
  const content = parts.map((part) => fs.readFileSync(path.join(patchDir, part), "utf8")).join("");
  fs.writeFileSync(patchPath, content);
  return true;
}

function cleanupTemporaryFiles() {
  removePostinstall();
  if (fs.existsSync(patchDir)) {
    for (const name of fs.readdirSync(patchDir)) {
      if (name.startsWith("fix-workout-flow.patch")) {
        fs.rmSync(path.join(patchDir, name), { force: true });
      }
    }
    try {
      fs.rmdirSync(patchDir);
    } catch (_) {}
  }
  fs.rmSync(scriptPath, { force: true });
  try {
    fs.rmdirSync(path.dirname(scriptPath));
  } catch (_) {}
}

if (process.env.GITHUB_ACTIONS !== "true") {
  console.log("[codex] Skipping patch outside GitHub Actions.");
  process.exit(0);
}

if (!buildPatchFromParts()) {
  console.log("[codex] No patch parts found; nothing to apply.");
  removePostinstall();
  process.exit(0);
}

try {
  run("git", ["apply", "--check", patchPath]);
  run("git", ["apply", patchPath]);
  cleanupTemporaryFiles();
  run("git", ["config", "user.name", "github-actions[bot]"]);
  run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  run("git", ["add", "-A"]);
  const staged = cp.execFileSync("git", ["diff", "--cached", "--name-only"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (!staged.trim()) {
    console.log("[codex] Patch already applied; no commit needed.");
    process.exit(0);
  }
  run("git", ["commit", "-m", "Fix workout flow and progress tracking"]);
  try {
    run("git", ["push", "origin", "HEAD:main"]);
  } catch (pushError) {
    console.log("[codex] Patch applied for this Expo update, but the cleanup commit could not be pushed.");
    console.log(pushError && pushError.message ? pushError.message : pushError);
  }
} catch (error) {
  console.error("[codex] Could not apply the workout flow patch.");
  console.error(error && error.message ? error.message : error);
  process.exit(1);
}
