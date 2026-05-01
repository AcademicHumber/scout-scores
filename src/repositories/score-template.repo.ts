import { unstable_cache, revalidateTag } from "next/cache"
import { prisma } from "@/lib/db"
import { cacheTags } from "./cache-tags"
import { BusinessError } from "@/lib/errors"
import type { ScoreTemplateModo, ScoreTemplateCategoria, TemplateCriterionTipo } from "@/generated/prisma/enums"
import { Decimal } from "@prisma/client/runtime/client"

// ─── Types ───────────────────────────────────────────────────────────────────

export type ScoreTemplateWithCriterios = Awaited<ReturnType<typeof _findById>>
type NonNullTemplate = NonNullable<ScoreTemplateWithCriterios>

// ─── Validation helper ────────────────────────────────────────────────────────

function validateEscala(valores: Decimal[], field: string): void {
  if (valores.length < 2 || valores.length > 20) {
    throw new BusinessError("ESCALA_INVALIDA", { field })
  }
  for (let i = 1; i < valores.length; i++) {
    if (valores[i]!.lessThanOrEqualTo(valores[i - 1]!)) {
      throw new BusinessError("ESCALA_INVALIDA", { field })
    }
  }
}

export function escalaEfectivaParaCriterio(
  template: { valoresValidos: Decimal[]; valoresValidosDesempate: Decimal[] },
  tipo: TemplateCriterionTipo,
): Decimal[] {
  if (tipo === "DESEMPATE" && template.valoresValidosDesempate.length > 0) {
    return template.valoresValidosDesempate
  }
  return template.valoresValidos
}

// ─── Reads ────────────────────────────────────────────────────────────────────

async function _findById(organizationId: string, id: string) {
  return prisma.scoreTemplate.findFirst({
    where: { id, organizationId },
    include: { criterios: { orderBy: { orden: "asc" } } },
  })
}

export function listScoreTemplates(
  organizationId: string,
  opts?: { includeArchived?: boolean },
) {
  return unstable_cache(
    async () => {
      const where = opts?.includeArchived
        ? { organizationId }
        : { organizationId, archivedAt: null }
      return prisma.scoreTemplate.findMany({
        where,
        include: { criterios: { orderBy: { orden: "asc" } } },
        orderBy: { nombre: "asc" },
      })
    },
    ["scoreTemplates", organizationId, String(opts?.includeArchived ?? false)],
    { tags: [cacheTags.scoreTemplates(organizationId)] },
  )()
}

export function findScoreTemplateById(organizationId: string, id: string) {
  return unstable_cache(
    async () => _findById(organizationId, id),
    ["scoreTemplate", organizationId, id],
    { tags: [cacheTags.scoreTemplates(organizationId)] },
  )()
}

export async function countScoreTemplates(
  organizationId: string,
  opts?: { activeOnly?: boolean },
) {
  return prisma.scoreTemplate.count({
    where: opts?.activeOnly
      ? { organizationId, archivedAt: null }
      : { organizationId },
  })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function isTemplateLocked(_templateId: string): Promise<boolean> {
  // Plan 4b activará esto cuando exista el modelo Posta.
  return false
}

// ─── Mutations ────────────────────────────────────────────────────────────────

type CreateData = {
  nombre: string
  descripcion?: string
  modo: ScoreTemplateModo
  categoria: ScoreTemplateCategoria
  valoresValidos: Decimal[]
  valoresValidosDesempate?: Decimal[]
  criterios?: { nombre: string; descripcion?: string; tipo: TemplateCriterionTipo }[]
}

export async function createScoreTemplate(
  organizationId: string,
  data: CreateData,
  actorUserId: string,
): Promise<{ id: string }> {
  validateEscala(data.valoresValidos, "valoresValidos")
  const desempate = data.valoresValidosDesempate ?? []
  if (desempate.length > 0) validateEscala(desempate, "valoresValidosDesempate")

  if (data.modo === "PUNTAJE_UNICO" && data.criterios) {
    const puntuables = data.criterios.filter((c) => c.tipo === "PUNTUABLE")
    if (puntuables.length > 0) throw new BusinessError("MODO_INCOMPATIBLE", { reason: "puntajeUnicoSoloDesempate" })
  }

  const existing = await prisma.scoreTemplate.findFirst({
    where: { organizationId, nombre: data.nombre },
  })
  if (existing) throw new BusinessError("NOMBRE_DUPLICADO")

  let createdId: string

  await prisma.$transaction(async (tx) => {
    const template = await tx.scoreTemplate.create({
      data: {
        organizationId,
        nombre: data.nombre,
        descripcion: data.descripcion,
        modo: data.modo,
        categoria: data.categoria,
        valoresValidos: data.valoresValidos,
        valoresValidosDesempate: desempate,
        criterios: data.criterios
          ? {
              create: data.criterios.map((c, i) => ({
                nombre: c.nombre,
                descripcion: c.descripcion,
                tipo: c.tipo,
                orden: i + 1,
              })),
            }
          : undefined,
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "scoreTemplate.created",
        targetType: "ScoreTemplate",
        targetId: template.id,
        metadata: { nombre: template.nombre, modo: template.modo, categoria: template.categoria },
      },
    })
    createdId = template.id
  })

  revalidateTag(cacheTags.scoreTemplates(organizationId))
  return { id: createdId! }
}

type UpdateMetadataData = {
  nombre: string
  descripcion?: string
  categoria: ScoreTemplateCategoria
}

export async function updateScoreTemplateMetadata(
  organizationId: string,
  id: string,
  data: UpdateMetadataData,
  actorUserId: string,
): Promise<void> {
  const template = await prisma.scoreTemplate.findFirst({ where: { id, organizationId } })
  if (!template) throw new BusinessError("NOT_FOUND")

  if (template.nombre !== data.nombre) {
    const existing = await prisma.scoreTemplate.findFirst({
      where: { organizationId, nombre: data.nombre },
    })
    if (existing) throw new BusinessError("NOMBRE_DUPLICADO")
  }

  await prisma.$transaction(async (tx) => {
    await tx.scoreTemplate.update({
      where: { id },
      data: { nombre: data.nombre, descripcion: data.descripcion, categoria: data.categoria },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "scoreTemplate.updated",
        targetType: "ScoreTemplate",
        targetId: id,
        metadata: { nombre: data.nombre, categoria: data.categoria },
      },
    })
  })
  // No revalidateTag: mutación de valores, no estructural.
}

type UpdateCoreData = {
  modo: ScoreTemplateModo
  valoresValidos: Decimal[]
  valoresValidosDesempate: Decimal[]
}

export async function updateScoreTemplateCore(
  organizationId: string,
  id: string,
  data: UpdateCoreData,
  actorUserId: string,
): Promise<void> {
  const template = await _findById(organizationId, id)
  if (!template) throw new BusinessError("NOT_FOUND")

  if (await isTemplateLocked(id)) throw new BusinessError("IN_USE")

  validateEscala(data.valoresValidos, "valoresValidos")
  if (data.valoresValidosDesempate.length > 0) {
    validateEscala(data.valoresValidosDesempate, "valoresValidosDesempate")
  }

  if (data.modo === "PUNTAJE_UNICO") {
    const bloqueantes = template.criterios.filter((c) => c.tipo === "PUNTUABLE")
    if (bloqueantes.length > 0) {
      throw new BusinessError("MODO_INCOMPATIBLE", {
        criteriosBloqueantes: bloqueantes.map((c) => ({ id: c.id, nombre: c.nombre })),
      })
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.scoreTemplate.update({
      where: { id },
      data: {
        modo: data.modo,
        valoresValidos: data.valoresValidos,
        valoresValidosDesempate: data.valoresValidosDesempate,
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "scoreTemplate.updated",
        targetType: "ScoreTemplate",
        targetId: id,
        metadata: { modo: data.modo },
      },
    })
  })
  // No revalidateTag: mutación de valores, no estructural.
}

export async function archiveScoreTemplate(
  organizationId: string,
  id: string,
  actorUserId: string,
): Promise<void> {
  const template = await prisma.scoreTemplate.findFirst({ where: { id, organizationId } })
  if (!template) throw new BusinessError("NOT_FOUND")

  await prisma.$transaction(async (tx) => {
    await tx.scoreTemplate.update({ where: { id }, data: { archivedAt: new Date() } })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "scoreTemplate.archived",
        targetType: "ScoreTemplate",
        targetId: id,
        metadata: { nombre: template.nombre },
      },
    })
  })
  revalidateTag(cacheTags.scoreTemplates(organizationId))
}

export async function unarchiveScoreTemplate(
  organizationId: string,
  id: string,
  actorUserId: string,
): Promise<void> {
  const template = await prisma.scoreTemplate.findFirst({ where: { id, organizationId } })
  if (!template) throw new BusinessError("NOT_FOUND")

  await prisma.$transaction(async (tx) => {
    await tx.scoreTemplate.update({ where: { id }, data: { archivedAt: null } })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "scoreTemplate.unarchived",
        targetType: "ScoreTemplate",
        targetId: id,
        metadata: { nombre: template.nombre },
      },
    })
  })
  revalidateTag(cacheTags.scoreTemplates(organizationId))
}

export async function duplicateScoreTemplate(
  organizationId: string,
  id: string,
  actorUserId: string,
): Promise<{ id: string }> {
  const original = await _findById(organizationId, id)
  if (!original) throw new BusinessError("NOT_FOUND")

  // Calcular nombre único con sufijo "(copia)", "(copia 2)", ...
  let nombre = `${original.nombre} (copia)`
  let suffix = 2
  while (await prisma.scoreTemplate.findFirst({ where: { organizationId, nombre } })) {
    nombre = `${original.nombre} (copia ${suffix})`
    suffix++
  }

  let createdId: string

  await prisma.$transaction(async (tx) => {
    const copy = await tx.scoreTemplate.create({
      data: {
        organizationId,
        nombre,
        descripcion: original.descripcion,
        modo: original.modo,
        categoria: original.categoria,
        valoresValidos: original.valoresValidos,
        valoresValidosDesempate: original.valoresValidosDesempate,
        criterios: {
          create: original.criterios.map((c) => ({
            nombre: c.nombre,
            descripcion: c.descripcion,
            tipo: c.tipo,
            orden: c.orden,
          })),
        },
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "scoreTemplate.duplicated",
        targetType: "ScoreTemplate",
        targetId: copy.id,
        metadata: { nombre: copy.nombre, originalId: original.id },
      },
    })
    createdId = copy.id
  })

  revalidateTag(cacheTags.scoreTemplates(organizationId))
  return { id: createdId! }
}

export async function deleteScoreTemplate(
  organizationId: string,
  id: string,
  actorUserId: string,
): Promise<void> {
  const template = await prisma.scoreTemplate.findFirst({ where: { id, organizationId } })
  if (!template) throw new BusinessError("NOT_FOUND")

  if (await isTemplateLocked(id)) throw new BusinessError("IN_USE")

  await prisma.$transaction(async (tx) => {
    await tx.scoreTemplate.delete({ where: { id } })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "scoreTemplate.deleted",
        targetType: "ScoreTemplate",
        targetId: id,
        metadata: { nombre: template.nombre },
      },
    })
  })
  revalidateTag(cacheTags.scoreTemplates(organizationId))
}

// ─── Criterios ────────────────────────────────────────────────────────────────

type CriterioData = {
  nombre: string
  descripcion?: string
  tipo: TemplateCriterionTipo
}

export async function addCriterio(
  organizationId: string,
  templateId: string,
  data: CriterioData,
  actorUserId: string,
): Promise<{ id: string }> {
  const template = await _findById(organizationId, templateId)
  if (!template) throw new BusinessError("NOT_FOUND")

  if (await isTemplateLocked(templateId)) throw new BusinessError("IN_USE")

  if (template.modo === "PUNTAJE_UNICO" && data.tipo === "PUNTUABLE") {
    throw new BusinessError("MODO_INCOMPATIBLE", { reason: "puntajeUnicoSoloDesempate" })
  }

  const maxOrden = template.criterios.reduce((max, c) => Math.max(max, c.orden), 0)

  let createdId: string

  await prisma.$transaction(async (tx) => {
    const criterio = await tx.templateCriterion.create({
      data: {
        templateId,
        nombre: data.nombre,
        descripcion: data.descripcion,
        tipo: data.tipo,
        orden: maxOrden + 1,
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "scoreTemplate.criterionAdded",
        targetType: "TemplateCriterion",
        targetId: criterio.id,
        metadata: { templateId, nombre: criterio.nombre, tipo: criterio.tipo },
      },
    })
    createdId = criterio.id
  })

  revalidateTag(cacheTags.scoreTemplates(organizationId))
  return { id: createdId! }
}

export async function updateCriterio(
  organizationId: string,
  templateId: string,
  criterioId: string,
  data: CriterioData,
  actorUserId: string,
): Promise<NonNullTemplate["criterios"][number]> {
  const template = await _findById(organizationId, templateId)
  if (!template) throw new BusinessError("NOT_FOUND")

  if (await isTemplateLocked(templateId)) throw new BusinessError("IN_USE")

  const criterio = template.criterios.find((c) => c.id === criterioId)
  if (!criterio) throw new BusinessError("CRITERIO_NO_ENCONTRADO")

  if (template.modo === "PUNTAJE_UNICO" && data.tipo === "PUNTUABLE") {
    throw new BusinessError("MODO_INCOMPATIBLE", { reason: "puntajeUnicoSoloDesempate" })
  }

  let updated: NonNullTemplate["criterios"][number]

  await prisma.$transaction(async (tx) => {
    updated = await tx.templateCriterion.update({
      where: { id: criterioId },
      data: { nombre: data.nombre, descripcion: data.descripcion, tipo: data.tipo },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "scoreTemplate.criterionUpdated",
        targetType: "TemplateCriterion",
        targetId: criterioId,
        metadata: { templateId, nombre: data.nombre, tipo: data.tipo },
      },
    })
  })

  // No revalidateTag: mutación de valores, no estructural.
  return updated!
}

export async function deleteCriterio(
  organizationId: string,
  templateId: string,
  criterioId: string,
  actorUserId: string,
): Promise<void> {
  const template = await _findById(organizationId, templateId)
  if (!template) throw new BusinessError("NOT_FOUND")

  if (await isTemplateLocked(templateId)) throw new BusinessError("IN_USE")

  const criterio = template.criterios.find((c) => c.id === criterioId)
  if (!criterio) throw new BusinessError("CRITERIO_NO_ENCONTRADO")

  await prisma.$transaction(async (tx) => {
    await tx.templateCriterion.delete({ where: { id: criterioId } })
    // Re-numerar los criterios restantes para mantener orden contiguo.
    const restantes = template.criterios
      .filter((c) => c.id !== criterioId)
      .sort((a, b) => a.orden - b.orden)
    for (let i = 0; i < restantes.length; i++) {
      if (restantes[i]!.orden !== i + 1) {
        await tx.templateCriterion.update({
          where: { id: restantes[i]!.id },
          data: { orden: i + 1 },
        })
      }
    }
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "scoreTemplate.criterionDeleted",
        targetType: "TemplateCriterion",
        targetId: criterioId,
        metadata: { templateId, nombre: criterio.nombre },
      },
    })
  })
  revalidateTag(cacheTags.scoreTemplates(organizationId))
}

export async function reorderCriterio(
  organizationId: string,
  templateId: string,
  criterioId: string,
  direction: "up" | "down",
  actorUserId: string,
): Promise<void> {
  const template = await _findById(organizationId, templateId)
  if (!template) throw new BusinessError("NOT_FOUND")

  if (await isTemplateLocked(templateId)) throw new BusinessError("IN_USE")

  const criterio = template.criterios.find((c) => c.id === criterioId)
  if (!criterio) throw new BusinessError("CRITERIO_NO_ENCONTRADO")

  const targetOrden = direction === "up" ? criterio.orden - 1 : criterio.orden + 1
  const swap = template.criterios.find((c) => c.orden === targetOrden)
  if (!swap) return // ya es primero o último

  await prisma.$transaction(async (tx) => {
    // Valor temporal para evitar violación de @@unique([templateId, orden])
    await tx.templateCriterion.update({ where: { id: criterio.id }, data: { orden: -1 } })
    await tx.templateCriterion.update({ where: { id: swap.id }, data: { orden: criterio.orden } })
    await tx.templateCriterion.update({ where: { id: criterio.id }, data: { orden: targetOrden } })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "scoreTemplate.criterionReordered",
        targetType: "TemplateCriterion",
        targetId: criterioId,
        metadata: { templateId, direction, fromOrden: criterio.orden, toOrden: targetOrden },
      },
    })
  })
  // No revalidateTag: reordenar no cambia la estructura de la lista de criterios.
}
