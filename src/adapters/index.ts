import type { LLMAdapter, LLMForecastResult } from "../llm/types.js";
import { normalizeDistribution } from "../types/ranges.js";
import { makeOpenRouterAdapter } from "./openrouter.js";

function mockResult(modelId: string, modelName: string): LLMForecastResult {
  const probs = normalizeDistribution({
    le_33: 2,
    r_34_35: 3,
    r_36_37: 5,
    r_38_39: 8,
    r_40_41: 11,
    r_42_43: 13,
    r_44_45: 15,
    r_46_47: 16,
    r_48_49: 13,
    r_50_51: 8,
    r_52_53: 4,
    ge_54: 2,
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

const useReal = Boolean(process.env.OPENROUTER_API_KEY);

const configured = [
  { id: "openai/gpt-5.3-codex", name: "GPT 5.3 Codex" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
  { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini" },
  { id: "meta-llama/llama-3.1-8b-instruct", name: "Llama 3.1 8B" },
  { id: "mistralai/mistral-7b-instruct", name: "Mistral 7B Instruct" },
];

export const llmAdapters: LLMAdapter[] = configured.map((m) =>
  useReal ? makeOpenRouterAdapter(m.id, m.name) : makeMockAdapter(m.id, m.name),
);
