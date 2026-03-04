import fs from "node:fs";
import path from "node:path";
import { prisma } from "../db/client.js";

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

  const signals = await prisma.edgeSignal.findMany({
    where: { forecastRunId: latestRun.id, cityId },
    orderBy: { edge: "desc" },
  });

  const picks = signals.slice(0, 3);
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
