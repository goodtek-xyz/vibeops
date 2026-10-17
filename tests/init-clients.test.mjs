import assert from "node:assert/strict";
import { test } from "node:test";

import { initClientChoices, parseClientsArg } from "../dist/lib/init-clients.js";

// The `init` agent prompt lists Claude Code, Codex CLI, Cursor — in that order (TASK-054).
test("init agent prompt lists Claude Code, Codex CLI, Cursor in that order", () => {
  const choices = initClientChoices();
  assert.deepEqual(
    choices.map((c) => c.value),
    ["claude", "codex", "cursor"],
  );
  assert.deepEqual(
    choices.map((c) => c.name.split(" (")[0]),
    ["Claude Code", "Codex CLI", "Cursor"],
  );
});

test("init agent prompt keeps Cursor as the only pre-checked agent", () => {
  assert.deepEqual(
    initClientChoices()
      .filter((c) => c.checked)
      .map((c) => c.value),
    ["cursor"],
  );
});

test("--clients keeps the order the user typed", () => {
  assert.deepEqual(parseClientsArg("cursor,claude-code,codex"), ["cursor", "claude", "codex"]);
});
