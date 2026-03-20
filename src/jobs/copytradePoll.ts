import cron from "node-cron";
import { config } from "../config/index.js";
import { refreshCopytradeState } from "../services/copytrade.service.js";
import { logWithTime } from "../utils/time.js";

export function startCopytradeScheduler() {
  if (!config.copytradePollEnabled) {
    logWithTime("copytrade", "scheduler disabled by COPYTRADE_POLL_ENABLED=false");
    return;
  }

  cron.schedule(config.copytradePollCron, () => {
    void refreshCopytradeState()
      .then((snapshot) => {
        logWithTime(
          "copytrade",
          `scheduled refresh ok lagSec=${snapshot.bot.lagSec.toFixed(1)} positions=${snapshot.positions.length}`,
        );
      })
      .catch((error) => {
        logWithTime("copytrade", `scheduled refresh failed error=${error instanceof Error ? error.message : String(error)}`);
      });
  });

  if (config.copytradeInitialRefresh) {
    void refreshCopytradeState()
      .then((snapshot) => {
        logWithTime(
          "copytrade",
          `initial refresh ok lagSec=${snapshot.bot.lagSec.toFixed(1)} positions=${snapshot.positions.length}`,
        );
      })
      .catch((error) => {
        logWithTime("copytrade", `initial refresh failed error=${error instanceof Error ? error.message : String(error)}`);
      });
  }

  logWithTime("copytrade", `scheduler started cron=${config.copytradePollCron}`);
}
