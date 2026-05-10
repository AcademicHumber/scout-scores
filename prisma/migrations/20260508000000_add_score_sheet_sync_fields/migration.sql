-- AlterTable: campos sync para ScoreSheet (Plan 7b)
ALTER TABLE "ScoreSheet" ADD COLUMN "clientId" TEXT;
ALTER TABLE "ScoreSheet" ADD COLUMN "clientSubmittedAt" TIMESTAMP(3);
ALTER TABLE "ScoreSheet" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: SyncOpLog para idempotencia de operaciones offline
CREATE TABLE "SyncOpLog" (
    "clientOpId"   TEXT NOT NULL,
    "scoreSheetId" TEXT NOT NULL,
    "version"      INTEGER NOT NULL,
    "processedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result"       JSONB NOT NULL,

    CONSTRAINT "SyncOpLog_pkey" PRIMARY KEY ("clientOpId")
);

-- CreateIndex
CREATE INDEX "SyncOpLog_scoreSheetId_idx" ON "SyncOpLog"("scoreSheetId");

-- CreateIndex
CREATE INDEX "SyncOpLog_processedAt_idx" ON "SyncOpLog"("processedAt");

-- AddForeignKey
ALTER TABLE "SyncOpLog" ADD CONSTRAINT "SyncOpLog_scoreSheetId_fkey"
    FOREIGN KEY ("scoreSheetId") REFERENCES "ScoreSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
