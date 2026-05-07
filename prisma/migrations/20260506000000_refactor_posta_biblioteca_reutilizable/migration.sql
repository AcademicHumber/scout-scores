-- DropForeignKey
ALTER TABLE "Posta" DROP CONSTRAINT "Posta_actividadId_fkey";

-- DropForeignKey
ALTER TABLE "Posta" DROP CONSTRAINT "Posta_juezUserId_fkey";

-- DropIndex
DROP INDEX "Posta_actividadId_idx";

-- DropIndex
DROP INDEX "Posta_actividadId_orden_key";

-- DropIndex
DROP INDEX "Posta_juezUserId_idx";

-- AlterTable
ALTER TABLE "Posta" DROP COLUMN "actividadId",
DROP COLUMN "juezUserId",
DROP COLUMN "orden",
DROP COLUMN "weight",
ADD COLUMN     "duracionMinutos" INTEGER,
ADD COLUMN     "materiales" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "organizationId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "AsignacionPosta" (
    "id" TEXT NOT NULL,
    "postaId" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "juezUserId" TEXT,
    "encargado" TEXT,
    "ayudantes" TEXT,
    "weight" DECIMAL(6,2) NOT NULL DEFAULT 1.0,
    "orden" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AsignacionPosta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AsignacionPosta_postaId_idx" ON "AsignacionPosta"("postaId");

-- CreateIndex
CREATE INDEX "AsignacionPosta_actividadId_idx" ON "AsignacionPosta"("actividadId");

-- CreateIndex
CREATE INDEX "AsignacionPosta_juezUserId_idx" ON "AsignacionPosta"("juezUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AsignacionPosta_actividadId_orden_key" ON "AsignacionPosta"("actividadId", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "AsignacionPosta_postaId_actividadId_key" ON "AsignacionPosta"("postaId", "actividadId");

-- CreateIndex
CREATE INDEX "Posta_organizationId_idx" ON "Posta"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Posta_organizationId_nombre_key" ON "Posta"("organizationId", "nombre");

-- AddForeignKey
ALTER TABLE "Posta" ADD CONSTRAINT "Posta_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionPosta" ADD CONSTRAINT "AsignacionPosta_postaId_fkey" FOREIGN KEY ("postaId") REFERENCES "Posta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionPosta" ADD CONSTRAINT "AsignacionPosta_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "Actividad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionPosta" ADD CONSTRAINT "AsignacionPosta_juezUserId_fkey" FOREIGN KEY ("juezUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
