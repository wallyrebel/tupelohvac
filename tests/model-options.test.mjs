import test from "node:test";
import assert from "node:assert/strict";
import { resolveRetiredModel, modelOptions } from "../scripts/model-options.mjs";

test("retired overrides map to approved Luna with bounded non-reasoning output", () => {
  for (const model of ["gpt-4.1-nano", "gpt-4.1-nano-2025-04-14", "gpt-6-luna"]) {
    assert.equal(resolveRetiredModel(model), "gpt-6-luna");
    assert.deepEqual(modelOptions(model), { reasoning_effort: "none", max_completion_tokens: 6000 });
  }
});

test("working primary role keeps its existing request parameters", () => {
  assert.equal(resolveRetiredModel("gpt-5-mini"), "gpt-5-mini");
  assert.deepEqual(modelOptions("gpt-5-mini"), { temperature: 0.6 });
});
