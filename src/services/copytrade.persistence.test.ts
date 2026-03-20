import { afterEach, describe, expect, it } from "vitest";
import {
  clearCopytradePersistenceForTests,
  getCopytradeSnapshot,
  initializeCopytradeState,
  pauseCopytrade,
  resetCopytradeState,
  updateCopytradeConfig,
} from "./copytrade.service.js";

afterEach(async () => {
  resetCopytradeState();
  await clearCopytradePersistenceForTests();
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
});
