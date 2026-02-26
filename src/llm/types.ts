import type { RangeKey } from "../types/ranges.js";

export type LLMForecastResult = {
  modelId: string;
  modelName: string;
  confidence: "low" | "medium" | "high";
  probs: Record<RangeKey, number>;
  reasoningSummary: string;
  raw: unknown;
  sumBeforeNormalization: number;
};

export interface LLMAdapter {
  getForecast(params: {
    targetDate: string;
    location: string;
    context?: object;
  }): Promise<LLMForecastResult>;
}
