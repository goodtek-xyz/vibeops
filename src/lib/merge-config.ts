import { join } from "node:path";

import { readTextOrNull } from "./filesystem.js";
import { VIBEOPS_CONFIG_FILE } from "./paths.js";
import type { VibeopsMergeConfig } from "../types/config.js";

/** Resolved merge-gate settings (defaults applied, validated). */
export interface MergeGateConfig {
  readonly requiredChecks: readonly string[];
  readonly releaseRequiredChecks: readonly string[];
  readonly waitTimeoutSeconds: number;
  readonly pollIntervalSeconds: number;
  readonly emptyRollupGraceSeconds: number;
  readonly allowNoChecks: boolean;
  readonly updateBranch: boolean;
}

/**
 * Job execution limits of GitHub Actions (docs.github.com/actions/reference/limits):
 * "up to 6 hours" per job on GitHub-hosted runners, "up to 5 days" on self-hosted ones.
 * A pending check cannot legitimately outlast its job, so these bound the wait.
 */
const GITHUB_HOSTED_JOB_LIMIT_SECONDS = 6 * 60 * 60;
const SELF_HOSTED_JOB_LIMIT_SECONDS = 5 * 24 * 60 * 60;

export const MERGE_GATE_DEFAULTS: MergeGateConfig = {
  requiredChecks: [],
  releaseRequiredChecks: [],
  // The wait ends as soon as the host reports every check finished; this only bounds a
  // check that never finishes. Self-hosted runners: raise it up to the 5-day job limit.
  waitTimeoutSeconds: GITHUB_HOSTED_JOB_LIMIT_SECONDS,
  // Same default as `gh pr checks --watch --interval` (cli.github.com/manual/gh_pr_checks).
  pollIntervalSeconds: 10,
  // No grace by default: CI outside GitHub Actions is awaited by name via `requiredChecks`
  // (like required status checks in branch protection), not by guessing how long it takes
  // to report.
  emptyRollupGraceSeconds: 0,
  allowNoChecks: false,
  // GitHub's own "Update branch" (merge, no force push) — see `updateGitHubPullBranch`.
  updateBranch: true,
};

/** Inclusive bounds for the numeric settings (seconds); cross-checks below keep them ≤ the wait. */
export const MERGE_GATE_LIMITS = {
  waitTimeoutSeconds: { min: 1, max: SELF_HOSTED_JOB_LIMIT_SECONDS },
  pollIntervalSeconds: { min: 1, max: SELF_HOSTED_JOB_LIMIT_SECONDS },
  emptyRollupGraceSeconds: { min: 0, max: SELF_HOSTED_JOB_LIMIT_SECONDS },
} as const;

const KNOWN_KEYS: ReadonlySet<keyof VibeopsMergeConfig> = new Set([
  "requiredChecks",
  "releaseRequiredChecks",
  "waitTimeoutSeconds",
  "pollIntervalSeconds",
  "emptyRollupGraceSeconds",
  "allowNoChecks",
  "updateBranch",
]);

/** Invalid `merge` block in `.vibeops.json`. Merge commands refuse to run. */
export class MergeConfigError extends Error {
  constructor(message: string) {
    super(`${VIBEOPS_CONFIG_FILE} merge: ${message}`);
    this.name = "MergeConfigError";
  }
}

function checkList(key: string, raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new MergeConfigError(`\`${key}\` must be an array of check names.`);
  }
  return raw.map((item, i) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new MergeConfigError(`\`${key}[${i}]\` must be a non-empty string.`);
    }
    return item.trim();
  });
}

function seconds(key: keyof typeof MERGE_GATE_LIMITS, raw: unknown): number {
  const { min, max } = MERGE_GATE_LIMITS[key];
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < min || raw > max) {
    throw new MergeConfigError(`\`${key}\` must be an integer between ${min} and ${max}.`);
  }
  return raw;
}

/**
 * Validate the raw `merge` block (fail closed): must be an object, only known
 * keys, lists of non-empty strings, bounded integer seconds, boolean flags.
 * `undefined` → defaults.
 */
export function parseMergeConfig(raw: unknown): MergeGateConfig {
  if (raw === undefined) return MERGE_GATE_DEFAULTS;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new MergeConfigError("must be an object.");
  }
  const o = raw as Record<string, unknown>;
  const unknown = Object.keys(o).filter(
    (k) => !KNOWN_KEYS.has(k as keyof VibeopsMergeConfig),
  );
  if (unknown.length > 0) {
    throw new MergeConfigError(
      `unknown key${unknown.length > 1 ? "s" : ""} ${unknown
        .map((k) => `\`${k}\``)
        .join(", ")} (allowed: ${[...KNOWN_KEYS].join(", ")}).`,
    );
  }

  const cfg = {
    requiredChecks:
      o.requiredChecks === undefined
        ? MERGE_GATE_DEFAULTS.requiredChecks
        : checkList("requiredChecks", o.requiredChecks),
    releaseRequiredChecks:
      o.releaseRequiredChecks === undefined
        ? MERGE_GATE_DEFAULTS.releaseRequiredChecks
        : checkList("releaseRequiredChecks", o.releaseRequiredChecks),
    waitTimeoutSeconds:
      o.waitTimeoutSeconds === undefined
        ? MERGE_GATE_DEFAULTS.waitTimeoutSeconds
        : seconds("waitTimeoutSeconds", o.waitTimeoutSeconds),
    pollIntervalSeconds:
      o.pollIntervalSeconds === undefined
        ? MERGE_GATE_DEFAULTS.pollIntervalSeconds
        : seconds("pollIntervalSeconds", o.pollIntervalSeconds),
    emptyRollupGraceSeconds:
      o.emptyRollupGraceSeconds === undefined
        ? MERGE_GATE_DEFAULTS.emptyRollupGraceSeconds
        : seconds("emptyRollupGraceSeconds", o.emptyRollupGraceSeconds),
    allowNoChecks: MERGE_GATE_DEFAULTS.allowNoChecks,
    updateBranch: MERGE_GATE_DEFAULTS.updateBranch,
  };
  if (o.updateBranch !== undefined) {
    if (typeof o.updateBranch !== "boolean") {
      throw new MergeConfigError("`updateBranch` must be true or false.");
    }
    cfg.updateBranch = o.updateBranch;
  }
  if (o.allowNoChecks !== undefined) {
    if (typeof o.allowNoChecks !== "boolean") {
      throw new MergeConfigError("`allowNoChecks` must be true or false.");
    }
    cfg.allowNoChecks = o.allowNoChecks;
  }
  if (cfg.emptyRollupGraceSeconds > cfg.waitTimeoutSeconds) {
    throw new MergeConfigError(
      "`emptyRollupGraceSeconds` must not exceed `waitTimeoutSeconds`.",
    );
  }
  if (cfg.pollIntervalSeconds > cfg.waitTimeoutSeconds) {
    throw new MergeConfigError(
      "`pollIntervalSeconds` must not exceed `waitTimeoutSeconds`.",
    );
  }
  return cfg;
}

/**
 * Read and validate `.vibeops.json` `merge`. Throws `MergeConfigError` on an
 * invalid block; a missing file or block yields the defaults.
 */
export async function readMergeConfig(root: string): Promise<MergeGateConfig> {
  const text = await readTextOrNull(join(root, VIBEOPS_CONFIG_FILE));
  if (text === null) return MERGE_GATE_DEFAULTS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new MergeConfigError("file is not valid JSON.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return MERGE_GATE_DEFAULTS;
  }
  return parseMergeConfig((parsed as { merge?: unknown }).merge);
}

/** Gate options (milliseconds) derived from resolved config. */
export function mergeGateTiming(cfg: MergeGateConfig): {
  timeoutMs: number;
  intervalMs: number;
  emptyRollupGraceMs: number;
} {
  return {
    timeoutMs: cfg.waitTimeoutSeconds * 1000,
    intervalMs: cfg.pollIntervalSeconds * 1000,
    emptyRollupGraceMs: cfg.emptyRollupGraceSeconds * 1000,
  };
}
