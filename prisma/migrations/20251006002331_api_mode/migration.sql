-- CreateTable
CREATE TABLE "ApiSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ApiRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apiSessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "headers" JSONB,
    "query" JSONB,
    "bodyMode" TEXT,
    "body" TEXT,
    "auth" JSONB,
    "preScripts" TEXT,
    "postScripts" TEXT,
    "assertions" JSONB,
    "lastStatus" INTEGER,
    "lastLatencyMs" INTEGER,
    "lastRespHeaders" JSONB,
    "lastRespBody" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApiRequest_apiSessionId_fkey" FOREIGN KEY ("apiSessionId") REFERENCES "ApiSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "actions" JSONB NOT NULL
);

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "_ApiSessionTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ApiSessionTags_A_fkey" FOREIGN KEY ("A") REFERENCES "ApiSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ApiSessionTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ApiBlockTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ApiBlockTags_A_fkey" FOREIGN KEY ("A") REFERENCES "ApiBlock" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ApiBlockTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Param" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stepTemplateId" TEXT,
    "apiBlockId" TEXT,
    "name" TEXT NOT NULL,
    "label" TEXT,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "defaultValue" TEXT,
    "enumValues" TEXT,
    CONSTRAINT "Param_stepTemplateId_fkey" FOREIGN KEY ("stepTemplateId") REFERENCES "StepTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Param_apiBlockId_fkey" FOREIGN KEY ("apiBlockId") REFERENCES "ApiBlock" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Param" ("defaultValue", "enumValues", "id", "label", "name", "required", "stepTemplateId", "type") SELECT "defaultValue", "enumValues", "id", "label", "name", "required", "stepTemplateId", "type" FROM "Param";
DROP TABLE "Param";
ALTER TABLE "new_Param" RENAME TO "Param";
CREATE TABLE "new_TestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "composition" JSONB NOT NULL,
    "snapshotDir" TEXT NOT NULL,
    "environmentId" TEXT,
    CONSTRAINT "TestCase_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TestCase" ("composition", "createdAt", "filePath", "id", "snapshotDir", "title") SELECT "composition", "createdAt", "filePath", "id", "snapshotDir", "title" FROM "TestCase";
DROP TABLE "TestCase";
ALTER TABLE "new_TestCase" RENAME TO "TestCase";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Environment_name_key" ON "Environment"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_ApiSessionTags_AB_unique" ON "_ApiSessionTags"("A", "B");

-- CreateIndex
CREATE INDEX "_ApiSessionTags_B_index" ON "_ApiSessionTags"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ApiBlockTags_AB_unique" ON "_ApiBlockTags"("A", "B");

-- CreateIndex
CREATE INDEX "_ApiBlockTags_B_index" ON "_ApiBlockTags"("B");
