export function resolveRetiredModel(model) {
  return ["gpt-4.1-nano", "gpt-4.1-nano-2025-04-14"].includes(model) ? "gpt-6-luna" : model;
}

export function modelOptions(model) {
  return resolveRetiredModel(model) === "gpt-6-luna"
    ? { reasoning_effort: "none", max_completion_tokens: 6000 }
    : { temperature: 0.6 };
}
