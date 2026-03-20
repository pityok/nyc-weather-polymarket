-- Persist copytrade runtime state/logs so backend can restore after restart.
CREATE TABLE "CopytradeStateStore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "stateJson" TEXT NOT NULL,
    "activityCursorSec" INTEGER,
    "dedupKeysJson" TEXT NOT NULL,
    "decisionLogJson" TEXT NOT NULL,
    "executionLogJson" TEXT NOT NULL,
    "refreshCount" INTEGER NOT NULL DEFAULT 0,
    "lastRefreshAt" DATETIME,
    "lastRefreshOkAt" DATETIME,
    "lastRefreshError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
