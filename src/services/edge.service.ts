import { config } from "../config/index.js";

export function computeEdgeRecommendation(consensusProb: number, marketProb: number) {
  const edge = consensusProb - marketProb;
  const threshold = config.edgeThreshold;
  const minProb = config.minProb;
  const recommendation = edge >= threshold && consensusProb >= minProb ? "bet" : "no_bet";
  return { edge, recommendation } as const;
}
