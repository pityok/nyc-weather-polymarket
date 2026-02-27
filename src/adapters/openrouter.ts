import { parseModelDistribution } from "../llm/parser.js";
import type { LLMAdapter, LLMForecastResult } from "../llm/types.js";

const BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";

async function callOpenRouter(model: string, prompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenRouter ${model} error: ${res.status} ${txt}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenRouter ${model}: empty content`);
  return content;
}

function makePrompt(targetDate: string, location: string) {
  return [
    `Forecast max temperature for ${location} on ${targetDate}.`,
    "Return ONLY JSON with shape:",
    '{"probs":{"le_33":number,"r_34_35":number,"r_36_37":number,"r_38_39":number,"r_40_41":number,"r_42_43":number,"r_44_45":number,"r_46_47":number,"ge_48":number},"confidence":"low|medium|high","reasoningSummary":"short text"}',
    "Probabilities are percentages and should sum to 100.",
  ].join("\n");
}

export function makeOpenRouterAdapter(modelId: string, modelName: string): LLMAdapter {
  return {
    async getForecast(params): Promise<LLMForecastResult> {
      const prompt = makePrompt(params.targetDate, params.location);
      const rawText = await callOpenRouter(modelId, prompt);
      const parsed = parseModelDistribution(rawText);

      return {
        modelId,
        modelName,
        confidence: parsed.confidence,
        probs: parsed.probs,
        reasoningSummary: parsed.reasoningSummary,
        raw: rawText,
        sumBeforeNormalization: parsed.sumBeforeNormalization,
      };
    },
  };
}
