-- CreateEnum
CREATE TYPE "EventoEstado" AS ENUM ('BORRADOR', 'ACTIVO', 'CERRADO', 'PUBLICADO');

-- CreateEnum
CREATE TYPE "ActividadTipo" AS ENUM ('COMPETICION', 'CONSTRUCCION', 'COCINA', 'OTRO');

-- CreateTable
CREATE TABLE "Evento" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "descripcion" TEXT,
    "lugar" TEXT,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3),
    "estado" "EventoEstado" NOT NULL DEFAULT 'BORRADOR',
    "activatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Actividad" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" "ActividadTipo" NOT NULL,
    "pesoRelativo" DECIMAL(5,2) NOT NULL,
    "orden" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Actividad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Evento_organizationId_idx" ON "Evento"("organizationId");

-- CreateIndex
CREATE INDEX "Evento_organizationId_estado_idx" ON "Evento"("organizationId", "estado");

-- CreateIndex
CREATE INDEX "Evento_organizationId_fechaInicio_idx" ON "Evento"("organizationId", "fechaInicio");

-- CreateIndex
CREATE UNIQUE INDEX "Evento_organizationId_slug_key" ON "Evento"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "Actividad_eventoId_idx" ON "Actividad"("eventoId");

-- CreateIndex
CREATE UNIQUE INDEX "Actividad_eventoId_orden_key" ON "Actividad"("eventoId", "orden");

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividad" ADD CONSTRAINT "Actividad_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
