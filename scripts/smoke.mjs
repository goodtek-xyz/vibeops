#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("dist/cli.js");

if (!existsSync(cli)) {
  console.error("[smoke] dist/cli.js is missing. Run `pnpm build` first.");
  process.exit(1);
}

const tmpRoot = mkdtempSync(join(tmpdir(), "vibeops-smoke-"));
const claudeRoot = mkdtempSync(join(tmpdir(), "vibeops-smoke-claude-"));
try {
  const cases = [
    ["--help"],
    [
      "init",
      "--cwd",
      tmpRoot,
      "--git",
      "--initial-commit",
      "--name",
      "smoke",
      "--clients",
      "cursor",
      "--allow-no-remote",
      "--git-policy",
      "gitflow",
    ],
    [
      "init",
      "--cwd",
      claudeRoot,
      "--git",
      "--name",
      "smoke-claude",
      "--clients",
      "claude",
      "--allow-no-remote",
      "--git-policy",
      "gitflow",
    ],
    ["init", "--dry-run"],
    ["status", "--cwd", tmpRoot],
    ["status", "--json", "--cwd", tmpRoot],
    ["llm", "status", "--cwd", tmpRoot],
    ["llm", "use", "auto", "--cwd", tmpRoot],
    [
      "task",
      "add",
      "--non-interactive",
      "--idea",
      "Smoke slice",
      "--cwd",
      tmpRoot,
    ],
    ["task", "del", "TASK-001", "--dry-run", "--cwd", tmpRoot],
    ["task", "ship", "--dry-run", "--cwd", tmpRoot],
    ["task", "ship", "--dry-run", "-m", "fix: tweak", "--cwd", tmpRoot],
    ["task", "ship", "--dry-run", "--no-commit", "--cwd", tmpRoot],
    ["task", "ship", "--dry-run", "--new-cycle", "--cwd", tmpRoot],
    ["task", "merge", "--dry-run", "--cwd", tmpRoot],
    ["task", "sync", "--dry-run", "--cwd", tmpRoot],
    ["pull", "--dry-run", "--cwd", tmpRoot],
    ["task", "release", "--dry-run", "--cwd", tmpRoot],
    ["status", "--cwd", tmpRoot],
  ];

  for (const args of cases) {
    const label = `node dist/cli.js ${args.join(" ")}`;
    process.stdout.write(`[smoke] ${label}\n`);
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: "pipe",
    });
    if (result.status !== 0) {
      process.stderr.write(result.stdout);
      process.stderr.write(result.stderr);
      console.error(`[smoke] failed: ${label}`);
      process.exit(result.status ?? 1);
    }
  }

  // init installs the testing / host-safety rule for consumer agents (TASK-069).
  const agentsMd = readFileSync(join(tmpRoot, "AGENTS.md"), "utf8");
  if (!agentsMd.includes("## Testing and host safety")) {
    console.error("[smoke] failed: AGENTS.md is missing the \"Testing and host safety\" section");
    process.exit(1);
  }

  // Claude Code reads CLAUDE.md, not AGENTS.md: the generated CLAUDE.md must import it (TASK-069).
  const claudeMd = readFileSync(join(claudeRoot, "CLAUDE.md"), "utf8");
  if (!claudeMd.split("\n").includes("@AGENTS.md")) {
    console.error("[smoke] failed: CLAUDE.md does not import @AGENTS.md");
    process.exit(1);
  }

  process.stdout.write("[smoke] OK\n");
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
  rmSync(claudeRoot, { recursive: true, force: true });
}
