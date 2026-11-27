import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  fallbackTaskPr,
  generateTaskPrWithLlm,
  normalizeTaskPrTitle,
} from "../dist/lib/task-pr-llm.js";

test("normalizeTaskPrTitle uses conventional commits with task scope", () => {
  assert.equal(
    normalizeTaskPrTitle(
      "TASK-013",
      "TASK-013: ship public status page and design alignment",
    ),
    "feat(task-013): ship public status page and design alignment",
  );
  assert.equal(
    normalizeTaskPrTitle("TASK-013", "ship public status page and design alignment"),
    "feat(task-013): ship public status page and design alignment",
  );
  assert.equal(
    normalizeTaskPrTitle("TASK-013", "fix: handle null"),
    "fix(task-013): handle null",
  );
});

test("fallbackTaskPr title matches PR title lint rules", () => {
  const { prTitle } = fallbackTaskPr({
    taskId: "TASK-013",
    title: "ship public status page and design alignment",
    taskBody: "",
    diffSummary: "",
    baseBranch: "develop",
    headBranch: "task/013-public-status-page-design-refresh",
  });
  assert.equal(
    prTitle,
    "feat(task-013): ship public status page and design alignment",
  );
});

test("generateTaskPrWithLlm with no LLM provider returns null without a warning", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "vibeops-pr-llm-"));
  const saved = {
    CODEX_HOME: process.env.CODEX_HOME,
    VIBEOPS_CURSOR_AGENT_BIN: process.env.VIBEOPS_CURSOR_AGENT_BIN,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };
  process.env.CODEX_HOME = join(dir, "codex-home");
  process.env.VIBEOPS_CURSOR_AGENT_BIN = join(dir, "no-such-agent");
  delete process.env.OPENAI_API_KEY;
  const warnings = [];
  t.mock.method(console, "warn", (...args) => warnings.push(args.join(" ")));
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  const result = await generateTaskPrWithLlm(
    {
      taskId: "TASK-013",
      title: "t",
      taskBody: "",
      diffSummary: "",
      baseBranch: "develop",
      headBranch: "task/013-t",
    },
    dir,
    "auto",
  );
  assert.equal(result, null);
  assert.deepEqual(warnings, []);
});
