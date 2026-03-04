import fs from "node:fs";
import path from "node:path";
import { prisma } from "../db/client.js";
import { getPolymarketNativeBins } from "./polymarketNative.service.js";
import { computeEdgeRecommendation } from "./edge.service.js";

const SIM_BETS_FILE = path.resolve(process.cwd(), "data/sim-bets.jsonl");

export type SimBet = {
  id: string;
  strategy: "equal33" | "edgeWeighted";
  cityId: string;
  targetDate: string;
  createdAt: string;
  runId: string;
  rangeKey: string;
  recommendation: string;
  stakeUsd: number;
  marketProb: number;
  aiProb: number;
  edge: number;
};

function dayBounds(date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T23:59:59.999Z`);
  return { start, end };
}

type FRange = { minF: number | null; maxF: number | null };
const LEGACY_F_RANGES: Record<string, FRange> = {
  le_33: { minF: null, maxF: 33 },
  r_34_35: { minF: 34, maxF: 35 },
  r_36_37: { minF: 36, maxF: 37 },
  r_38_39: { minF: 38, maxF: 39 },
  r_40_41: { minF: 40, maxF: 41 },
  r_42_43: { minF: 42, maxF: 43 },
  r_44_45: { minF: 44, maxF: 45 },
  r_46_47: { minF: 46, maxF: 47 },
  r_48_49: { minF: 48, maxF: 49 },
  r_50_51: { minF: 50, maxF: 51 },
  r_52_53: { minF: 52, maxF: 53 },
  ge_54: { minF: 54, maxF: null },
};

function overlapWeight(a: FRange, b: FRange): number {
  const aMin = a.minF ?? Number.NEGATIVE_INFINITY;
  const aMax = a.maxF ?? Number.POSITIVE_INFINITY;
  const bMin = b.minF ?? Number.NEGATIVE_INFINITY;
  const bMax = b.maxF ?? Number.POSITIVE_INFINITY;
  if (aMax < bMin || bMax < aMin) return 0;
  if (Number.isFinite(aMin) && Number.isFinite(aMax) && Number.isFinite(bMin) && Number.isFinite(bMax)) {
    return Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin) + 1);
  }
  return 1;
}

function projectLegacyToNative(
  legacy: Record<string, number>,
  nativeBins: Array<{ key: string; minF: number | null; maxF: number | null }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const bin of nativeBins) {
    let sum = 0;
    let totalW = 0;
    const target: FRange = { minF: bin.minF, maxF: bin.maxF };

    for (const [k, srcRange] of Object.entries(LEGACY_F_RANGES)) {
      const p = Number(legacy[k] ?? 0);
      if (!Number.isFinite(p) || p <= 0) continue;
      const w = overlapWeight(srcRange, target);
      if (w <= 0) continue;
      sum += p * w;
      totalW += w;
    }

    out[bin.key] = totalW > 0 ? Number((sum / totalW).toFixed(4)) : 0;
  }

  const s = Object.values(out).reduce((a, b) => a + b, 0);
  if (s > 0) {
    for (const k of Object.keys(out)) out[k] = Number(((out[k] / s) * 100).toFixed(4));
  }

  return out;
}

export function readSimBets(): SimBet[] {
  if (!fs.existsSync(SIM_BETS_FILE)) return [];
  const lines = fs.readFileSync(SIM_BETS_FILE, "utf8").split("\n").filter(Boolean);
  const out: SimBet[] = [];
  for (const ln of lines) {
    try {
      out.push(JSON.parse(ln) as SimBet);
    } catch {
      // ignore malformed lines
    }
  }
  return out;
}

function appendSimBets(items: SimBet[]) {
  if (!items.length) return;
  fs.mkdirSync(path.dirname(SIM_BETS_FILE), { recursive: true });
  const payload = items.map((x) => JSON.stringify(x)).join("\n") + "\n";
  fs.appendFileSync(SIM_BETS_FILE, payload, "utf8");
}

export async function ensureSimBetsForDate(cityId: string, date: string): Promise<SimBet[]> {
  const all = readSimBets();
  let items = all.filter((x) => x.cityId === cityId && x.targetDate === date);

  const hasEqual = items.some((x) => x.strategy === "equal33");
  const hasWeighted = items.some((x) => x.strategy === "edgeWeighted");
  if (hasEqual && hasWeighted) return items;

  const { start, end } = dayBounds(date);
  const latestRun = await prisma.forecastRun.findFirst({
    where: { targetDate: { gte: start, lte: end }, cityId },
    orderBy: { createdAt: "desc" },
  });

  if (!latestRun) return items;

  const native = await getPolymarketNativeBins(date, cityId);

  let picks: Array<{ rangeKey: string; recommendation: string; marketProb: number; aiProb: number; edge: number }> = [];

  if (native.status === "healthy" && native.bins.length) {
    const weighted = await prisma.consensus.findFirst({
      where: { forecastRunId: latestRun.id, method: "weighted" },
    });
    const fallback = await prisma.consensus.findFirst({ where: { forecastRunId: latestRun.id } });
    const probsRaw = (weighted ?? fallback)?.probsJson ?? "{}";
    let legacy: Record<string, number> = {};
    try {
      legacy = JSON.parse(probsRaw) as Record<string, number>;
    } catch {
      legacy = {};
    }

    const aiByNative = projectLegacyToNative(legacy, native.bins);
    picks = native.bins
      .map((b) => {
        const aiProb = Number(aiByNative[b.key] ?? 0);
        const marketProb = Number(b.yesProb ?? 0);
        const { edge, recommendation } = computeEdgeRecommendation(aiProb, marketProb);
        return {
          rangeKey: b.label || b.key,
          recommendation,
          marketProb,
          aiProb,
          edge,
        };
      })
      .sort((a, b) => b.edge - a.edge)
      .slice(0, 3);
  } else {
    const signals = await prisma.edgeSignal.findMany({
      where: { forecastRunId: latestRun.id, cityId },
      orderBy: { edge: "desc" },
    });
    picks = signals.slice(0, 3).map((s) => ({
      rangeKey: s.rangeKey,
      recommendation: s.recommendation,
      marketProb: s.marketProb,
      aiProb: s.aiProb,
      edge: s.edge,
    }));
  }

  if (!picks.length) return items;

  const createdAt = new Date().toISOString();

  const equalStake = 100 / picks.length;
  const simEqual = hasEqual
    ? []
    : picks.map((p, i) => ({
        id: `sim_equal_${latestRun.id}_${i}`,
        strategy: "equal33" as const,
        cityId,
        targetDate: date,
        createdAt,
        runId: latestRun.id,
        rangeKey: p.rangeKey,
        recommendation: p.recommendation,
        stakeUsd: Number(equalStake.toFixed(2)),
        marketProb: p.marketProb,
        aiProb: p.aiProb,
        edge: p.edge,
      }));

  const alpha = 1.35;
  const beta = 0.7;
  const minStake = 10;
  const maxStake = 60;

  const rawWeights = picks.map((p) => Math.pow(Math.max(0, p.edge), alpha) * Math.pow(Math.max(0, p.aiProb) / 100, beta));
  const wSum = rawWeights.reduce((a, b) => a + b, 0) || 1;
  let stakes = rawWeights.map((w) => (w / wSum) * 100);
  stakes = stakes.map((s) => Math.max(minStake, Math.min(maxStake, s)));
  const cappedSum = stakes.reduce((a, b) => a + b, 0) || 1;
  stakes = stakes.map((s) => (s / cappedSum) * 100);

  const simWeighted = hasWeighted
    ? []
    : picks.map((p, i) => ({
        id: `sim_weighted_${latestRun.id}_${i}`,
        strategy: "edgeWeighted" as const,
        cityId,
        targetDate: date,
        createdAt,
        runId: latestRun.id,
        rangeKey: p.rangeKey,
        recommendation: p.recommendation,
        stakeUsd: Number(stakes[i].toFixed(2)),
        marketProb: p.marketProb,
        aiProb: p.aiProb,
        edge: p.edge,
      }));

  const created = [...simEqual, ...simWeighted];
  appendSimBets(created);

  items = [...items, ...created];
  return items;
}
