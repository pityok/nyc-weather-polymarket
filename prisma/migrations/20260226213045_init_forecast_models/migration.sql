-- CreateTable
CREATE TABLE "ForecastRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runTimeUtc" DATETIME NOT NULL,
    "runTimeMsk" DATETIME NOT NULL,
    "targetDate" DATETIME NOT NULL,
    "horizon" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ModelForecast" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "forecastRunId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "rawResponse" TEXT NOT NULL,
    "probsJson" TEXT NOT NULL,
    "sumBeforeNormalization" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModelForecast_forecastRunId_fkey" FOREIGN KEY ("forecastRunId") REFERENCES "ForecastRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetDate" DATETIME NOT NULL,
    "snapshotTimeUtc" DATETIME NOT NULL,
    "snapshotType" TEXT NOT NULL,
    "probsJson" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Consensus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "forecastRunId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "probsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Consensus_forecastRunId_fkey" FOREIGN KEY ("forecastRunId") REFERENCES "ForecastRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EdgeSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "forecastRunId" TEXT NOT NULL,
    "targetDate" DATETIME NOT NULL,
    "rangeKey" TEXT NOT NULL,
    "aiProb" REAL NOT NULL,
    "marketProb" REAL NOT NULL,
    "edge" REAL NOT NULL,
    "recommendation" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EdgeSignal_forecastRunId_fkey" FOREIGN KEY ("forecastRunId") REFERENCES "ForecastRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActualOutcome" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetDate" DATETIME NOT NULL,
    "winningRangeKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ForecastRun_targetDate_idx" ON "ForecastRun"("targetDate");

-- CreateIndex
CREATE INDEX "ForecastRun_createdAt_idx" ON "ForecastRun"("createdAt");

-- CreateIndex
CREATE INDEX "ForecastRun_horizon_idx" ON "ForecastRun"("horizon");

-- CreateIndex
CREATE INDEX "ModelForecast_forecastRunId_idx" ON "ModelForecast"("forecastRunId");

-- CreateIndex
CREATE INDEX "ModelForecast_createdAt_idx" ON "ModelForecast"("createdAt");

-- CreateIndex
CREATE INDEX "MarketSnapshot_targetDate_idx" ON "MarketSnapshot"("targetDate");

-- CreateIndex
CREATE INDEX "MarketSnapshot_snapshotType_idx" ON "MarketSnapshot"("snapshotType");

-- CreateIndex
CREATE INDEX "MarketSnapshot_createdAt_idx" ON "MarketSnapshot"("createdAt");

-- CreateIndex
CREATE INDEX "MarketSnapshot_targetDate_snapshotType_idx" ON "MarketSnapshot"("targetDate", "snapshotType");

-- CreateIndex
CREATE INDEX "Consensus_forecastRunId_idx" ON "Consensus"("forecastRunId");

-- CreateIndex
CREATE INDEX "Consensus_createdAt_idx" ON "Consensus"("createdAt");

-- CreateIndex
CREATE INDEX "EdgeSignal_forecastRunId_idx" ON "EdgeSignal"("forecastRunId");

-- CreateIndex
CREATE INDEX "EdgeSignal_targetDate_idx" ON "EdgeSignal"("targetDate");

-- CreateIndex
CREATE INDEX "EdgeSignal_createdAt_idx" ON "EdgeSignal"("createdAt");

-- CreateIndex
CREATE INDEX "EdgeSignal_forecastRunId_targetDate_idx" ON "EdgeSignal"("forecastRunId", "targetDate");

-- CreateIndex
CREATE UNIQUE INDEX "ActualOutcome_targetDate_key" ON "ActualOutcome"("targetDate");

-- CreateIndex
CREATE INDEX "ActualOutcome_targetDate_idx" ON "ActualOutcome"("targetDate");
