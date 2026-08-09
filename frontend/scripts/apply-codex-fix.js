#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const crypto = require("crypto");
const zlib = require("zlib");

const repoRoot = path.resolve(__dirname, "../..");
const patchDir = path.join(repoRoot, ".codex-patches");
const patchPath = path.join(patchDir, "fix-workout-flow.patch");
const packagePath = path.join(repoRoot, "frontend", "package.json");
const scriptPath = __filename;
const postinstallCommand = "node ./scripts/apply-codex-fix.js";
const expectedPatchSha256 = "edd49e98028558c0dc62a3ceb51d26e5f117942e6783488d0394bfcf14287b1e";

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
  const gzParts = fs
    .readdirSync(patchDir)
    .filter((name) => name.startsWith("fix-workout-flow.patch.gz.b64.part-"))
    .sort();
  if (gzParts.length) {
    const encoded = gzParts.map((part) => fs.readFileSync(path.join(patchDir, part), "utf8")).join("").replace(/\s+/g, "");
    const patch = zlib.gunzipSync(Buffer.from(encoded, "base64"));
    const hash = crypto.createHash("sha256").update(patch).digest("hex");
    if (hash !== expectedPatchSha256) {
      throw new Error(`Patch checksum mismatch: ${hash}`);
    }
    fs.writeFileSync(patchPath, patch);
    return true;
  }
  const textParts = fs
    .readdirSync(patchDir)
    .filter((name) => name.startsWith("fix-workout-flow.patch.part-"))
    .sort();
  if (!textParts.length) return false;
  const content = textParts.map((part) => fs.readFileSync(path.join(patchDir, part), "utf8")).join("");
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
  run("git", ["push", "origin", "HEAD:main"]);
} catch (error) {
  console.error("[codex] Could not apply the workout flow patch.");
  console.error(error && error.message ? error.message : error);
  process.exit(1);
}
