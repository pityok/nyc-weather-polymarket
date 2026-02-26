import type { LLMAdapter, LLMForecastResult } from "../llm/types.js";
import { normalizeDistribution } from "../types/ranges.js";

function mockResult(modelId: string, modelName: string): LLMForecastResult {
  const probs = normalizeDistribution({
    le_33: 5,
    r_34_35: 8,
    r_36_37: 12,
    r_38_39: 16,
    r_40_41: 17,
    r_42_43: 16,
    r_44_45: 12,
    r_46_47: 8,
    ge_48: 6,
  });
  return {
    modelId,
    modelName,
    confidence: "medium",
    probs,
    reasoningSummary: "Mock forecast",
    raw: { mock: true },
    sumBeforeNormalization: 100,
  };
}

function makeMockAdapter(modelId: string, modelName: string): LLMAdapter {
  return {
    async getForecast() {
      return mockResult(modelId, modelName);
    },
  };
}

export const openaiAdapter = makeMockAdapter("openai/gpt-5.3-codex", "GPT 5.3 Codex");
export const anthropicAdapter = makeMockAdapter("anthropic/claude-opus-4.1", "Claude Opus 4.1");
export const googleAdapter = makeMockAdapter("google/gemini-2.5-pro", "Gemini 2.5 Pro");
export const qwenAdapter = makeMockAdapter("qwen/qwen-2.5-72b-instruct", "Qwen 2.5 72B");
export const gpt4oMiniAdapter = makeMockAdapter("openai/gpt-4o-mini", "GPT-4o Mini");

export const llmAdapters: LLMAdapter[] = [
  openaiAdapter,
  anthropicAdapter,
  googleAdapter,
  qwenAdapter,
  gpt4oMiniAdapter,
];
