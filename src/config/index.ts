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
} as const;
