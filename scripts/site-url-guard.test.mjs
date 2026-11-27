// BUILD-CHECK: searched scripts/*.test.mjs (grep canonical|SITE_URL|localhost) + bin/tool-inventory.py "site url
//   canonical localhost build guard" 2026-11-27 -> no test loads astro.config.mjs.
// NEAREST: scripts/do-not-publish.test.mjs (reads dist/ for a different property; never imports the config).
// NOT-REUSED-BECAUSE: every existing suite reads BUILT output; this property is a refusal at config load, before any
//   dist/ exists, so it cannot live in a dist-reading test. A test, not a runner: it writes nothing.
// APPROVED-BY: pmbuilder seat-channel task 2026-11-27 02:52Z "Make the build refuse when SITE_URL is unset instead of
//   silently building wrong. Selftest both."
//
// astro.config.mjs refuses `astro build` when PUBLIC_SITE_URL is unset (worktree builds without the gitignored .env
// emitted http://localhost:4321 canonicals). Proved both ways: unset -> the config import throws naming the variable;
// set -> it loads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CONFIG = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "astro.config.mjs")).href;

function loadConfig(env) {
  const cwd = mkdtempSync(path.join(tmpdir(), "site-url-guard-")); // no .env here: loadEnv reads the cwd
  try {
    const clean = { ...process.env, ...env };
    if (!("PUBLIC_SITE_URL" in env)) delete clean.PUBLIC_SITE_URL;
    return spawnSync(process.execPath,
      ["--input-type=module", "-e", `process.argv.push("build"); await import(${JSON.stringify(CONFIG)});`],
      { cwd, env: clean, encoding: "utf8", timeout: 60000 });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("a build with PUBLIC_SITE_URL unset is REFUSED, naming the variable", () => {
  const r = loadConfig({});
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /PUBLIC_SITE_URL is unset/);
});

test("a build with PUBLIC_SITE_URL set loads the config", () => {
  const r = loadConfig({ PUBLIC_SITE_URL: "https://spiritmediapublishing.com" });
  assert.equal(r.status, 0, r.stderr);
});
