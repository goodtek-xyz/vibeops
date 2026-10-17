import { join } from "node:path";

import { readTextOrNull } from "./filesystem.js";
import { runGit } from "./git.js";
import { dim, log } from "./logger.js";
import { VIBEOPS_CONFIG_FILE } from "./paths.js";
import type { VibeopsGitConfig } from "../types/config.js";

/**
 * Preflight checks run by `task add` / `task ship` (`.vibeops.json` → `baseline`):
 * the repository follows the VibeOps branch flow (integration ≠ production, the remote's
 * default branch is the integration branch) and, when a persona crew is configured, the crew
 * is installed (`.personas/<crew>/SOURCE`, `<!-- getpersona:<crew> -->` section in AGENTS.md).
 * Names match the maintainers' repository baseline report.
 */
export type BaselineMode = "off" | "warn" | "enforce";

export interface BaselineConfig {
  readonly mode: BaselineMode;
  /** Persona crew to require (e.g. `vibe-crew`); none → crew checks are skipped. */
  readonly crew: string | null;
}

export const BASELINE_DEFAULTS: BaselineConfig = { mode: "warn", crew: null };

export class BaselineConfigError extends Error {
  constructor(message: string) {
    super(`Invalid \`baseline\` block in .vibeops.json: ${message}`);
    this.name = "BaselineConfigError";
  }
}

const MODES: readonly BaselineMode[] = ["off", "warn", "enforce"];
const CREW_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Strict: object with only `mode` / `crew`. `undefined` → defaults. */
export function parseBaselineConfig(raw: unknown): BaselineConfig {
  if (raw === undefined) return BASELINE_DEFAULTS;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new BaselineConfigError("must be an object.");
  }
  const o = raw as Record<string, unknown>;
  const unknown = Object.keys(o).filter((k) => k !== "mode" && k !== "crew");
  if (unknown.length > 0) {
    throw new BaselineConfigError(`unknown key \`${unknown[0]}\` (known: mode, crew).`);
  }
  let mode = BASELINE_DEFAULTS.mode;
  if (o.mode !== undefined) {
    if (typeof o.mode !== "string" || !MODES.includes(o.mode as BaselineMode)) {
      throw new BaselineConfigError("`mode` must be one of off, warn, enforce.");
    }
    mode = o.mode as BaselineMode;
  }
  let crew: string | null = null;
  if (o.crew !== undefined) {
    if (typeof o.crew !== "string" || !CREW_RE.test(o.crew)) {
      throw new BaselineConfigError("`crew` must be a crew name like `vibe-crew`.");
    }
    crew = o.crew;
  }
  return { mode, crew };
}

export async function readBaselineConfig(root: string): Promise<BaselineConfig> {
  const text = await readTextOrNull(join(root, VIBEOPS_CONFIG_FILE));
  if (text === null) return BASELINE_DEFAULTS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BaselineConfigError("file is not valid JSON.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return BASELINE_DEFAULTS;
  }
  return parseBaselineConfig((parsed as { baseline?: unknown }).baseline);
}

export interface BaselineCheck {
  readonly id: "branch-policy" | "default-branch" | "personas" | "agents-contract";
  readonly ok: boolean;
  readonly detail: string;
  /** How to fix it (shown when not ok). */
  readonly fix?: string;
}

/** The remote's default branch from `git ls-remote --symref <remote> HEAD`, or null. */
async function remoteDefaultBranch(cwd: string, remote: string): Promise<string | null> {
  try {
    const { stdout } = await runGit(cwd, ["ls-remote", "--symref", remote, "HEAD"]);
    const m = /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/m.exec(stdout);
    return m ? m[1]! : null;
  } catch {
    return null;
  }
}

export async function runBaselineChecks(
  cwd: string,
  git: VibeopsGitConfig,
  cfg: BaselineConfig,
): Promise<BaselineCheck[]> {
  const checks: BaselineCheck[] = [];
  const gitflow = git.integrationBranch !== git.productionBranch;
  checks.push({
    id: "branch-policy",
    ok: gitflow,
    detail: gitflow
      ? `${git.integrationBranch} (integration) → ${git.productionBranch} (production)`
      : `integration and production are both ${git.integrationBranch}`,
    fix: "set `git.integrationBranch` (e.g. develop) ≠ `git.productionBranch` (main) in .vibeops.json",
  });
  const def = await remoteDefaultBranch(cwd, git.remote);
  checks.push({
    id: "default-branch",
    ok: def === git.integrationBranch,
    detail:
      def === null
        ? `could not read the default branch of ${git.remote}`
        : `${git.remote} default branch is ${def}`,
    fix:
      git.host === "gitlab"
        ? `glab api --method PUT projects/:id --raw-field default_branch=${git.integrationBranch}`
        : `gh repo edit --default-branch ${git.integrationBranch}`,
  });
  if (cfg.crew !== null) {
    const source = await readTextOrNull(join(cwd, ".personas", cfg.crew, "SOURCE"));
    checks.push({
      id: "personas",
      ok: source !== null,
      detail: source !== null ? `.personas/${cfg.crew}/SOURCE present` : `.personas/${cfg.crew}/SOURCE missing`,
      fix: `install the ${cfg.crew} crew (it writes .personas/${cfg.crew}/ and the AGENTS.md section)`,
    });
    const agents = await readTextOrNull(join(cwd, "AGENTS.md"));
    const marker = `<!-- getpersona:${cfg.crew} -->`;
    const has = agents !== null && agents.includes(marker);
    checks.push({
      id: "agents-contract",
      ok: has,
      detail: has ? `AGENTS.md has the ${cfg.crew} section` : `AGENTS.md lacks ${marker}`,
      fix: `install the ${cfg.crew} crew (AGENTS.md section between ${marker} markers)`,
    });
  }
  return checks;
}

/**
 * Run the configured checks and print failures. Returns false only in `enforce` mode with a
 * failing check (the caller stops); `warn` prints and continues; `off` skips.
 */
export async function preflightBaseline(
  cwd: string,
  git: VibeopsGitConfig,
  command: string,
): Promise<boolean> {
  let cfg: BaselineConfig;
  try {
    cfg = await readBaselineConfig(cwd);
  } catch (e) {
    log.error(e instanceof Error ? e.message : String(e));
    return false;
  }
  if (cfg.mode === "off") return true;
  const failed = (await runBaselineChecks(cwd, git, cfg)).filter((c) => !c.ok);
  if (failed.length === 0) return true;
  const enforce = cfg.mode === "enforce";
  for (const c of failed) {
    const line = `baseline ${c.id}: ${c.detail}`;
    if (enforce) log.error(line);
    else log.warn(line);
    if (c.fix) log.info(dim(`  fix: ${c.fix}`));
  }
  if (enforce) {
    log.info(dim(`${command} stopped (.vibeops.json baseline.mode: enforce).`));
    return false;
  }
  return true;
}

export interface BaselineSummary {
  readonly mode: BaselineMode;
  readonly crew: string | null;
  /** `commit:` line of `.personas/<crew>/SOURCE` (pinned catalog commit), when present. */
  readonly crewCommit: string | null;
  readonly checks: readonly BaselineCheck[];
  /** Remote branches other than integration, production, `task/*`, `sync/*`; null = unreadable. */
  readonly otherBranches: readonly string[] | null;
  /** Invalid `baseline` block in .vibeops.json, when it is. */
  readonly configError: string | null;
}

/** Read-only summary for `vibeops status` (never throws). */
export async function summarizeBaseline(
  cwd: string,
  git: VibeopsGitConfig,
): Promise<BaselineSummary> {
  let cfg = BASELINE_DEFAULTS;
  let configError: string | null = null;
  try {
    cfg = await readBaselineConfig(cwd);
  } catch (e) {
    configError = e instanceof Error ? e.message : String(e);
  }
  const checks = await runBaselineChecks(cwd, git, cfg);
  let crewCommit: string | null = null;
  if (cfg.crew !== null) {
    const source = await readTextOrNull(join(cwd, ".personas", cfg.crew, "SOURCE"));
    crewCommit = source === null ? null : (/^commit:\s*(\S+)/m.exec(source)?.[1] ?? null);
  }
  let otherBranches: string[] | null = null;
  try {
    const { stdout } = await runGit(cwd, ["ls-remote", "--heads", git.remote]);
    otherBranches = stdout
      .split("\n")
      .map((l) => l.split("\t")[1]?.replace(/^refs\/heads\//, "") ?? "")
      .filter(
        (b) =>
          b.length > 0 &&
          b !== git.integrationBranch &&
          b !== git.productionBranch &&
          !b.startsWith("task/") &&
          !b.startsWith("sync/"),
      );
  } catch {
    otherBranches = null;
  }
  return { mode: cfg.mode, crew: cfg.crew, crewCommit, checks, otherBranches, configError };
}
