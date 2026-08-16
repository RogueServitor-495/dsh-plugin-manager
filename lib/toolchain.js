// dsh-plugin-manager — toolchain discovery and safe subprocess helpers.
//
// pnpm is the package manager that owns the profile directory (the same tool
// `dsh plugin --profile <name> add|remove` forwards to). It is discovered by
// config, then PATH, then the npx-store layout, then common install locations.
// All commands run WITHOUT a shell, so source strings never reach a shell.
// @ts-check

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** @param {string} file @returns {string | null} */
function existing(file) {
  if (!file) return null;
  return existsSync(file) ? file : null;
}

/** @param {string} name @returns {string | null} resolve a bin on PATH */
function onPath(name) {
  const pathEntries = (process.env.PATH ?? "").split(":").filter(Boolean);
  for (const dir of pathEntries) {
    const candidate = existing(join(dir, name));
    if (candidate) return candidate;
    if (process.platform === "win32") {
      const win = existing(join(dir, name + ".cmd")) ?? existing(join(dir, name + ".exe"));
      if (win) return win;
    }
  }
  return null;
}

/** Glob-ish scan for a bin inside the npm npx store (~/.npm/_npx). */
function npxStoreBin(name) {
  const npxRoot = join(homedir(), ".npm", "_npx");
  if (!existsSync(npxRoot)) return null;
  let entries;
  try { entries = readdirSync(npxRoot); } catch { return null; }
  for (const hash of entries) {
    const candidate = join(npxRoot, hash, "node_modules", ".bin", name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolve the pnpm binary.
 * @param {string | undefined} configured
 * @returns {string | null} absolute path or bare name on PATH
 */
export function findPnpm(configured) {
  if (configured) return configured;
  return (
    onPath("pnpm") ??
    npxStoreBin("pnpm") ??
    existing(join(homedir(), ".local", "share", "pnpm", "pnpm")) ??
    existing("/opt/homebrew/bin/pnpm") ??
    existing("/usr/local/bin/pnpm")
  );
}

/** @param {string | undefined} configured @returns {string | null} */
export function findGit(configured) {
  if (configured) return configured;
  return onPath("git") ?? existing("/usr/bin/git") ?? existing("/opt/homebrew/bin/git");
}

/** The directory that holds the running node binary (prepended to PATH for children). */
export function nodeBinDir() {
  try {
    return dirname(process.execPath);
  } catch {
    return "";
  }
}

/**
 * Run a command capturing stdout/stderr. Never uses a shell.
 * @param {string} command absolute path or bare name
 * @param {string[]} args
 * @param {{ cwd?: string, timeoutMs?: number, env?: Record<string, string | undefined> }} [options]
 * @returns {Promise<{ ok: boolean, code: number | null, stdout: string, stderr: string, error?: string, signal?: string }>}
 */
export function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise) => {
    const timeoutMs = options.timeoutMs ?? 300_000;
    const env = {
      ...process.env,
      PATH: [nodeBinDir(), process.env.PATH ?? ""].filter(Boolean).join(":"),
      ...(options.env ?? {})
    };
    const child = spawn(command, args, {
      cwd: options.cwd,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolvePromise({ ok: false, code: null, stdout, stderr, error: `timed out after ${Math.round(timeoutMs / 1000)}s`, signal: "SIGKILL" });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ ok: false, code: null, stdout, stderr, error: err.message });
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ ok: code === 0, code, stdout, stderr, signal: signal ?? void 0 });
    });
  });
}

/** Last N chars of a combined log, for surfacing in the UI. */
export function tail(log, n = 6000) {
  if (!log) return "";
  return log.length > n ? "…" + log.slice(-n) : log;
}
