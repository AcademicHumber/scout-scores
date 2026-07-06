-- 1. Agregar columna nullable + FK a Actividad
ALTER TABLE "Actividad" ADD COLUMN "templateId" TEXT;
CREATE INDEX "Actividad_templateId_idx" ON "Actividad"("templateId");
ALTER TABLE "Actividad" ADD CONSTRAINT "Actividad_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "ScoreTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Backfill: para cada actividad, tomar el (único) templateId no-nulo
--    entre las postas de sus asignaciones. Si hay más de uno distinto,
--    este UPDATE deliberadamente no resuelve el conflicto (deja NULL) —
--    el admin debe asignarlo a mano desde la UI (Plan 15).
UPDATE "Actividad" a
SET "templateId" = sub.template_id
FROM (
  SELECT ap."actividadId" AS actividad_id, MIN(p."templateId") AS template_id
  FROM "AsignacionPosta" ap
  JOIN "Posta" p ON p.id = ap."postaId"
  WHERE p."templateId" IS NOT NULL
  GROUP BY ap."actividadId"
  HAVING COUNT(DISTINCT p."templateId") = 1
) sub
WHERE a.id = sub.actividad_id;

-- 3. Quitar templateId de Posta
ALTER TABLE "Posta" DROP CONSTRAINT "Posta_templateId_fkey";
DROP INDEX "Posta_templateId_idx";
ALTER TABLE "Posta" DROP COLUMN "templateId";

-- 4. Nueva columna de leyenda por valor (sin relación a backfillear, arranca vacía)
ALTER TABLE "Posta" ADD COLUMN "criteriosDescripciones" JSONB NOT NULL DEFAULT '{}';
