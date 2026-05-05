-- CreateEnum
CREATE TYPE "PatrullaCategoria" AS ENUM ('LOBATO', 'EXPLORADOR', 'PIONERO', 'ROVER');

-- CreateTable
CREATE TABLE "Posta" (
    "id" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "templateId" TEXT,
    "weight" DECIMAL(6,2) NOT NULL DEFAULT 1.0,
    "juezUserId" TEXT,
    "orden" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Posta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patrulla" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "grupoScoutId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" "PatrullaCategoria",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patrulla_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Posta_actividadId_idx" ON "Posta"("actividadId");

-- CreateIndex
CREATE INDEX "Posta_templateId_idx" ON "Posta"("templateId");

-- CreateIndex
CREATE INDEX "Posta_juezUserId_idx" ON "Posta"("juezUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Posta_actividadId_orden_key" ON "Posta"("actividadId", "orden");

-- CreateIndex
CREATE INDEX "Patrulla_eventoId_idx" ON "Patrulla"("eventoId");

-- CreateIndex
CREATE INDEX "Patrulla_grupoScoutId_idx" ON "Patrulla"("grupoScoutId");

-- CreateIndex
CREATE UNIQUE INDEX "Patrulla_eventoId_nombre_key" ON "Patrulla"("eventoId", "nombre");

-- AddForeignKey
ALTER TABLE "Posta" ADD CONSTRAINT "Posta_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "Actividad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Posta" ADD CONSTRAINT "Posta_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScoreTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Posta" ADD CONSTRAINT "Posta_juezUserId_fkey" FOREIGN KEY ("juezUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patrulla" ADD CONSTRAINT "Patrulla_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patrulla" ADD CONSTRAINT "Patrulla_grupoScoutId_fkey" FOREIGN KEY ("grupoScoutId") REFERENCES "GrupoScout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
