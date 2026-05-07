-- CreateEnum
CREATE TYPE "ScoreSheetEstado" AS ENUM ('BORRADOR', 'ENVIADA');

-- CreateTable
CREATE TABLE "ScoreSheet" (
    "id" TEXT NOT NULL,
    "asignacionPostaId" TEXT NOT NULL,
    "patrullaId" TEXT NOT NULL,
    "estado" "ScoreSheetEstado" NOT NULL DEFAULT 'BORRADOR',
    "puntajeUnico" DECIMAL(8,2),
    "totalPuntuable" DECIMAL(10,2),
    "totalDesempate" DECIMAL(10,2),
    "enviadaAt" TIMESTAMP(3),
    "enviadaByUserId" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreEntry" (
    "id" TEXT NOT NULL,
    "scoreSheetId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "valor" DECIMAL(8,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScoreSheet_asignacionPostaId_idx" ON "ScoreSheet"("asignacionPostaId");

-- CreateIndex
CREATE INDEX "ScoreSheet_patrullaId_idx" ON "ScoreSheet"("patrullaId");

-- CreateIndex
CREATE INDEX "ScoreSheet_estado_idx" ON "ScoreSheet"("estado");

-- CreateIndex
CREATE INDEX "ScoreSheet_enviadaByUserId_idx" ON "ScoreSheet"("enviadaByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreSheet_asignacionPostaId_patrullaId_key" ON "ScoreSheet"("asignacionPostaId", "patrullaId");

-- CreateIndex
CREATE INDEX "ScoreEntry_scoreSheetId_idx" ON "ScoreEntry"("scoreSheetId");

-- CreateIndex
CREATE INDEX "ScoreEntry_criterionId_idx" ON "ScoreEntry"("criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreEntry_scoreSheetId_criterionId_key" ON "ScoreEntry"("scoreSheetId", "criterionId");

-- AddForeignKey
ALTER TABLE "ScoreSheet" ADD CONSTRAINT "ScoreSheet_asignacionPostaId_fkey" FOREIGN KEY ("asignacionPostaId") REFERENCES "AsignacionPosta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreSheet" ADD CONSTRAINT "ScoreSheet_patrullaId_fkey" FOREIGN KEY ("patrullaId") REFERENCES "Patrulla"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreSheet" ADD CONSTRAINT "ScoreSheet_enviadaByUserId_fkey" FOREIGN KEY ("enviadaByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreSheet" ADD CONSTRAINT "ScoreSheet_reopenedByUserId_fkey" FOREIGN KEY ("reopenedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEntry" ADD CONSTRAINT "ScoreEntry_scoreSheetId_fkey" FOREIGN KEY ("scoreSheetId") REFERENCES "ScoreSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEntry" ADD CONSTRAINT "ScoreEntry_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "TemplateCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
