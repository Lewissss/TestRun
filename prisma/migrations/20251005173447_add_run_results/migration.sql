-- CreateTable
CREATE TABLE "RunResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "testIds" JSONB NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "logPath" TEXT,
    "summaryPath" TEXT
);
