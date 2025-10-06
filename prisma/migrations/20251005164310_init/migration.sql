-- CreateTable
CREATE TABLE "Recording" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "viewportW" INTEGER NOT NULL DEFAULT 1366,
    "viewportH" INTEGER NOT NULL DEFAULT 900,
    "scale" INTEGER NOT NULL DEFAULT 1,
    "traceZipPath" TEXT NOT NULL,
    "flowLogPath" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Step" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recordingId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "route" TEXT,
    "selector" TEXT,
    "role" TEXT,
    "name" TEXT,
    "testid" TEXT,
    "apiHints" JSONB,
    "screenshot" TEXT NOT NULL,
    "customName" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "paramHints" JSONB,
    CONSTRAINT "Step_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StepTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "block" JSONB NOT NULL
);

-- CreateTable
CREATE TABLE "Param" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stepTemplateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "defaultValue" TEXT,
    "enumValues" TEXT,
    CONSTRAINT "Param_stepTemplateId_fkey" FOREIGN KEY ("stepTemplateId") REFERENCES "StepTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "composition" JSONB NOT NULL,
    "snapshotDir" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "DataSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bindings" JSONB NOT NULL
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_RecordingTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_RecordingTags_A_fkey" FOREIGN KEY ("A") REFERENCES "Recording" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_RecordingTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_BlockTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_BlockTags_A_fkey" FOREIGN KEY ("A") REFERENCES "StepTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_BlockTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_DataSetTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_DataSetTags_A_fkey" FOREIGN KEY ("A") REFERENCES "DataSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_DataSetTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_TestTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_TestTags_A_fkey" FOREIGN KEY ("A") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_TestTags_B_fkey" FOREIGN KEY ("B") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_RecordingTags_AB_unique" ON "_RecordingTags"("A", "B");

-- CreateIndex
CREATE INDEX "_RecordingTags_B_index" ON "_RecordingTags"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_BlockTags_AB_unique" ON "_BlockTags"("A", "B");

-- CreateIndex
CREATE INDEX "_BlockTags_B_index" ON "_BlockTags"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_DataSetTags_AB_unique" ON "_DataSetTags"("A", "B");

-- CreateIndex
CREATE INDEX "_DataSetTags_B_index" ON "_DataSetTags"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_TestTags_AB_unique" ON "_TestTags"("A", "B");

-- CreateIndex
CREATE INDEX "_TestTags_B_index" ON "_TestTags"("B");
