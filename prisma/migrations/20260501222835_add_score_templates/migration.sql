-- CreateEnum
CREATE TYPE "ScoreTemplateModo" AS ENUM ('CRITERIOS', 'PUNTAJE_UNICO');

-- CreateEnum
CREATE TYPE "ScoreTemplateCategoria" AS ENUM ('COMPETICION', 'CONSTRUCCION', 'COCINA', 'OTRO');

-- CreateEnum
CREATE TYPE "TemplateCriterionTipo" AS ENUM ('PUNTUABLE', 'DESEMPATE');

-- CreateTable
CREATE TABLE "ScoreTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "modo" "ScoreTemplateModo" NOT NULL,
    "categoria" "ScoreTemplateCategoria" NOT NULL,
    "valoresValidos" DECIMAL(65,30)[],
    "valoresValidosDesempate" DECIMAL(65,30)[],
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateCriterion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" "TemplateCriterionTipo" NOT NULL,
    "orden" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScoreTemplate_organizationId_idx" ON "ScoreTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "ScoreTemplate_organizationId_archivedAt_idx" ON "ScoreTemplate"("organizationId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreTemplate_organizationId_nombre_key" ON "ScoreTemplate"("organizationId", "nombre");

-- CreateIndex
CREATE INDEX "TemplateCriterion_templateId_idx" ON "TemplateCriterion"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateCriterion_templateId_orden_key" ON "TemplateCriterion"("templateId", "orden");

-- AddForeignKey
ALTER TABLE "ScoreTemplate" ADD CONSTRAINT "ScoreTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateCriterion" ADD CONSTRAINT "TemplateCriterion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScoreTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
