import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  forecastCron: process.env.FORECAST_CRON ?? "*/30 * * * *",
  forecastJobEnabled: process.env.FORECAST_JOB_ENABLED !== "false",
  edgeThreshold: Number(process.env.EDGE_THRESHOLD ?? 10),
  minProb: Number(process.env.MIN_PROB ?? 12),
  baselineOnly: process.env.BASELINE_ONLY !== "false",
  // P3: require 7d quality data before allowing bet signals (default off to avoid breaking production)
  qualityGateRequired: process.env.QUALITY_GATE_REQUIRED === "true",
  defaultCityId: process.env.DEFAULT_CITY_ID ?? "nyc",
  copytradePollCron: process.env.COPYTRADE_POLL_CRON ?? "*/2 * * * *",
  copytradePollEnabled: process.env.COPYTRADE_POLL_ENABLED !== "false",
  copytradeInitialRefresh: process.env.COPYTRADE_INITIAL_REFRESH !== "false",
  copytradeLeaderWallet: process.env.COPYTRADE_LEADER_WALLET ?? "0xaa930fdc4caa3c0f6067404a7bd7899ca45f0bc7",
  copytradeFollowerWallet: process.env.COPYTRADE_FOLLOWER_WALLET ?? "0xace51d70031617af61a8e809c28eebcef1c84457",
  copytradeActivityPageLimit: Number(process.env.COPYTRADE_ACTIVITY_PAGE_LIMIT ?? 200),
  copytradeActivityMaxPages: Number(process.env.COPYTRADE_ACTIVITY_MAX_PAGES ?? 25),
} as const;
