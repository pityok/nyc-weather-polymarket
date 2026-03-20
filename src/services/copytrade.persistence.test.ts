import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearCopytradePersistenceForTests,
  getCopytradeSnapshot,
  initializeCopytradeState,
  pauseCopytrade,
  refreshCopytradeState,
  resetCopytradeState,
  setCopytradeMode,
  updateCopytradeConfig,
} from "./copytrade.service.js";

afterEach(async () => {
  resetCopytradeState();
  await clearCopytradePersistenceForTests();
  vi.restoreAllMocks();
});

describe("copytrade sqlite persistence", () => {
  it("restores persisted config and mode after in-memory reset", async () => {
    await updateCopytradeConfig({ scale: 0.42, minTradeNotionalUsd: 7.5, maxSignalAgeSec: 333 });
    await pauseCopytrade({ reason: "persist this" });

    expect(getCopytradeSnapshot().mode).toBe("paused");
    expect(getCopytradeSnapshot().config.scale).toBe(0.42);

    resetCopytradeState();
    expect(getCopytradeSnapshot().mode).toBe("dry-run");
    expect(getCopytradeSnapshot().config.scale).not.toBe(0.42);

    await initializeCopytradeState({ force: true });

    const restored = getCopytradeSnapshot();
    expect(restored.mode).toBe("paused");
    expect(restored.bot.pausedReason).toBe("persist this");
    expect(restored.config.scale).toBe(0.42);
    expect(restored.config.minTradeNotionalUsd).toBe(7.5);
    expect(restored.config.maxSignalAgeSec).toBe(333);
  });

  it("uses persisted cursor and dedup keys to apply only new leader activity after restore", async () => {
    const now = Math.floor(Date.now() / 1000);
    let activityCall = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("/activity?")) {
        activityCall += 1;

        if (activityCall === 1) {
          return new Response(JSON.stringify([
            {
              name: "Lex-tang",
              type: "TRADE",
              conditionId: "cond-live-1",
              title: "Will the highest temperature in New York City be between 54-55°F on March 21?",
              eventSlug: "highest-temperature-in-nyc-on-march-21-2026",
              outcome: "Yes",
              side: "BUY",
              size: 120,
              usdcSize: 30,
              price: 0.25,
              timestamp: now - 120,
              transactionHash: "0xabc",
            },
            {
              name: "Lex-tang",
              type: "TRADE",
              conditionId: "cond-live-1",
              title: "Will the highest temperature in New York City be between 54-55°F on March 21?",
              eventSlug: "highest-temperature-in-nyc-on-march-21-2026",
              outcome: "Yes",
              side: "BUY",
              size: 30,
              usdcSize: 9,
              price: 0.3,
              timestamp: now - 100,
              transactionHash: "0xdef",
            },
          ]), { status: 200, headers: { "content-type": "application/json" } });
        }

        return new Response(JSON.stringify([
          {
            name: "Lex-tang",
            type: "TRADE",
            conditionId: "cond-live-1",
            title: "Will the highest temperature in New York City be between 54-55°F on March 21?",
            eventSlug: "highest-temperature-in-nyc-on-march-21-2026",
            outcome: "Yes",
            side: "BUY",
            size: 10,
            usdcSize: 3.2,
            price: 0.32,
            timestamp: now - 40,
            transactionHash: "0xghi",
          },
          {
            name: "Lex-tang",
            type: "TRADE",
            conditionId: "cond-live-1",
            title: "Will the highest temperature in New York City be between 54-55°F on March 21?",
            eventSlug: "highest-temperature-in-nyc-on-march-21-2026",
            outcome: "Yes",
            side: "BUY",
            size: 30,
            usdcSize: 9,
            price: 0.3,
            timestamp: now - 100,
            transactionHash: "0xdef",
          },
        ]), { status: 200, headers: { "content-type": "application/json" } });
      }

      if (url.includes("/positions?")) {
        return new Response(JSON.stringify([
          {
            conditionId: "cond-live-1",
            title: "Will the highest temperature in New York City be between 54-55°F on March 21?",
            outcome: "Yes",
            size: 8,
            avgPrice: 0.2,
            curPrice: 0.32,
            currentValue: 2.56,
            cashPnl: 0.96,
            realizedPnl: 0,
          },
        ]), { status: 200, headers: { "content-type": "application/json" } });
      }

      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    });

    await refreshCopytradeState();
    expect(getCopytradeSnapshot().positions[0]?.lexNetShares).toBe(150);

    resetCopytradeState();
    await initializeCopytradeState({ force: true });
    await refreshCopytradeState();

    const restored = getCopytradeSnapshot();
    expect(restored.positions[0]).toMatchObject({
      conditionId: "cond-live-1",
      lexNetShares: 160,
      myTargetShares: 16,
      deltaShares: 8,
    });
    expect(restored.leaderEvents[0]?.txHash).toBe("0xghi");
    expect(activityCall).toBe(2);
  });

  it("persists a paper execution ledger across restart without duplicating identical staged orders", async () => {
    const now = Math.floor(Date.now() / 1000);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("/activity?")) {
        return new Response(JSON.stringify([
          {
            name: "Lex-tang",
            type: "TRADE",
            conditionId: "cond-paper-1",
            title: "Will the highest temperature in New York City be between 58-59°F on March 21?",
            eventSlug: "highest-temperature-in-nyc-on-march-21-2026",
            outcome: "Yes",
            side: "BUY",
            size: 90,
            usdcSize: 27,
            price: 0.3,
            timestamp: now - 30,
            transactionHash: "0xpaper-1",
          },
        ]), { status: 200, headers: { "content-type": "application/json" } });
      }

      if (url.includes("/positions?")) {
        return new Response(JSON.stringify([
          {
            conditionId: "cond-paper-1",
            title: "Will the highest temperature in New York City be between 58-59°F on March 21?",
            outcome: "Yes",
            size: 0,
            avgPrice: 0,
            curPrice: 0.3,
            currentValue: 0,
            cashPnl: 0,
            realizedPnl: 0,
          },
        ]), { status: 200, headers: { "content-type": "application/json" } });
      }

      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    });

    await updateCopytradeConfig({ quietWindowSec: 0 });
    await setCopytradeMode({ mode: "paper" });
    await refreshCopytradeState();
    await refreshCopytradeState();

    const snapshot = getCopytradeSnapshot();
    expect(snapshot.executionLog).toHaveLength(1);
    expect(snapshot.executionLog[0]).toMatchObject({
      conditionId: "cond-paper-1",
      action: "BUY",
      status: "EXECUTING",
      executionStatus: "EXECUTING",
      executionPhase: "paper_order_staged",
    });

    resetCopytradeState();
    await initializeCopytradeState({ force: true });

    const restored = getCopytradeSnapshot();
    expect(restored.mode).toBe("paper");
    expect(restored.executionLog).toHaveLength(1);
    expect(restored.executionLog[0]?.executionPhase).toBe("paper_order_staged");
  });

});
