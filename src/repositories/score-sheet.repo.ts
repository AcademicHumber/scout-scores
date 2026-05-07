import { unstable_cache, revalidateTag } from "next/cache"
import { prisma } from "@/lib/db"
import { cacheTags } from "./cache-tags"
import { BusinessError } from "@/lib/errors"
import type { ScoreSheetEstado } from "@/generated/prisma/enums"
import { Decimal } from "@prisma/client/runtime/client"

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _findAsignacionAccesible(
  organizationId: string,
  asignacionId: string,
  userId: string,
  isAdmin: boolean,
) {
  const asignacion = await prisma.asignacionPosta.findFirst({
    where: { id: asignacionId, actividad: { evento: { organizationId } } },
    include: {
      actividad: { include: { evento: { select: { id: true, estado: true } } } },
      posta: {
        include: {
          template: {
            include: { criterios: { orderBy: { orden: "asc" } } },
          },
        },
      },
    },
  })
  if (!asignacion) throw new BusinessError("ASIGNACION_NO_ENCONTRADA")
  if (!isAdmin && asignacion.juezUserId !== userId) throw new BusinessError("FORBIDDEN_NO_ASIGNADO")
  if (asignacion.actividad.evento.estado !== "ACTIVO") throw new BusinessError("EVENTO_NO_ACTIVO")
  return asignacion
}

type AsignacionConTemplate = Awaited<ReturnType<typeof _findAsignacionAccesible>>

// ─── Validation helpers ───────────────────────────────────────────────────────

type SaveScoreSheetData = {
  entries?: { criterionId: string; valor: Decimal }[]
  puntajeUnico?: Decimal | null
}

function _validateValoresEnEscala(
  asignacion: AsignacionConTemplate,
  data: SaveScoreSheetData,
): void {
  const template = asignacion.posta.template
  if (!template) return

  // Comparar como string para evitar divergencias de representación Decimal
  const valoresPuntuable = template.valoresValidos.map((d) => d.toString())
  const valoresDesempate = (
    template.valoresValidosDesempate.length > 0
      ? template.valoresValidosDesempate
      : template.valoresValidos
  ).map((d) => d.toString())

  if (data.puntajeUnico != null) {
    if (!valoresPuntuable.includes(data.puntajeUnico.toString())) {
      throw new BusinessError("VALOR_FUERA_DE_ESCALA", {
        esperados: template.valoresValidos.map((d) => d.toNumber()),
        recibido: data.puntajeUnico.toNumber(),
      })
    }
  }

  for (const e of data.entries ?? []) {
    const criterio = template.criterios.find((c) => c.id === e.criterionId)
    if (!criterio) throw new BusinessError("CRITERIO_NO_ENCONTRADO")
    const escala = criterio.tipo === "DESEMPATE" ? valoresDesempate : valoresPuntuable
    if (!escala.includes(e.valor.toString())) {
      throw new BusinessError("VALOR_FUERA_DE_ESCALA", {
        criterioId: criterio.id,
        esperados: (criterio.tipo === "DESEMPATE"
          ? template.valoresValidosDesempate.length > 0
            ? template.valoresValidosDesempate
            : template.valoresValidos
          : template.valoresValidos
        ).map((d) => d.toNumber()),
        recibido: e.valor.toNumber(),
      })
    }
  }
}

function _calcularTotales(
  asignacion: AsignacionConTemplate,
  data: SaveScoreSheetData,
): { totalPuntuable: Decimal; totalDesempate: Decimal } {
  const template = asignacion.posta.template
  const weight = asignacion.weight

  let sumaPuntuable = new Decimal(0)
  let sumaDesempate = new Decimal(0)

  if (!template) {
    // Posta sin plantilla: totalPuntuable = puntajeUnico × weight si aplica
    if (data.puntajeUnico == null) throw new BusinessError("PUNTAJE_UNICO_REQUERIDO")
    return {
      totalPuntuable: new Decimal(data.puntajeUnico).times(weight),
      totalDesempate: new Decimal(0),
    }
  }

  if (template.modo === "PUNTAJE_UNICO") {
    if (data.puntajeUnico == null) throw new BusinessError("PUNTAJE_UNICO_REQUERIDO")
    sumaPuntuable = new Decimal(data.puntajeUnico)
  } else {
    // CRITERIOS: validar que existan entries para todos los PUNTUABLE
    const puntuables = template.criterios.filter((c) => c.tipo === "PUNTUABLE")
    const entriesById = new Map(
      // Deduplicar: si hay criterionId repetido, quedar con el último
      (data.entries ?? []).map((e) => [e.criterionId, e.valor]),
    )
    const faltantes = puntuables.filter((c) => !entriesById.has(c.id))
    if (faltantes.length > 0) {
      throw new BusinessError("CRITERIOS_FALTANTES", {
        criterios: faltantes.map((c) => ({ id: c.id, nombre: c.nombre })),
      })
    }
    for (const c of puntuables) {
      sumaPuntuable = sumaPuntuable.plus(entriesById.get(c.id)!)
    }
  }

  // DESEMPATE: criterios DESEMPATE suman sin weight
  for (const e of data.entries ?? []) {
    const criterio = template.criterios.find((c) => c.id === e.criterionId)
    if (criterio?.tipo === "DESEMPATE") {
      sumaDesempate = sumaDesempate.plus(e.valor)
    }
  }

  return {
    totalPuntuable: sumaPuntuable.times(weight),
    totalDesempate: sumaDesempate,
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export type EventoJuezSummary = {
  id: string
  nombre: string
  lugar: string | null
  fechaInicio: Date
  postasCount: number
}

export function listEventosParaJuez(
  organizationId: string,
  userId: string,
  isAdmin: boolean,
) {
  return unstable_cache(
    async (): Promise<EventoJuezSummary[]> => {
      const eventos = await prisma.evento.findMany({
        where: {
          organizationId,
          estado: "ACTIVO",
          actividades: isAdmin
            ? undefined
            : { some: { asignaciones: { some: { juezUserId: userId } } } },
        },
        include: {
          actividades: {
            include: {
              asignaciones: {
                where: isAdmin ? {} : { juezUserId: userId },
                select: { id: true },
              },
            },
          },
        },
        orderBy: { fechaInicio: "asc" },
      })

      return eventos.map((e) => ({
        id: e.id,
        nombre: e.nombre,
        lugar: e.lugar,
        fechaInicio: e.fechaInicio,
        postasCount: e.actividades.flatMap((a) => a.asignaciones).length,
      }))
    },
    [`listEventosParaJuez:${organizationId}:${userId}:${isAdmin}`],
    { tags: [cacheTags.scoreSheets(organizationId), cacheTags.eventos(organizationId)] },
  )()
}

export type PostaJuezSummary = {
  asignacionId: string
  postaNombre: string
  actividadNombre: string
  plantillaModo: "CRITERIOS" | "PUNTAJE_UNICO" | null
  totalPatrullas: number
  enviadas: number
  borradores: number
  sinCargar: number
}

export function listPostasParaJuez(
  organizationId: string,
  eventoId: string,
  userId: string,
  isAdmin: boolean,
) {
  return unstable_cache(
    async (): Promise<PostaJuezSummary[]> => {
      const evento = await prisma.evento.findFirst({
        where: { id: eventoId, organizationId },
        include: {
          patrullas: { select: { id: true } },
          actividades: {
            orderBy: { orden: "asc" },
            include: {
              asignaciones: {
                where: isAdmin ? {} : { juezUserId: userId },
                orderBy: { orden: "asc" },
                include: {
                  posta: {
                    include: { template: { select: { modo: true } } },
                  },
                  scoreSheets: { select: { estado: true } },
                },
              },
            },
          },
        },
      })

      if (!evento) return []

      const totalPatrullas = evento.patrullas.length
      const result: PostaJuezSummary[] = []

      for (const actividad of evento.actividades) {
        for (const asignacion of actividad.asignaciones) {
          const enviadas = asignacion.scoreSheets.filter((s) => s.estado === "ENVIADA").length
          const borradores = asignacion.scoreSheets.filter((s) => s.estado === "BORRADOR").length
          result.push({
            asignacionId: asignacion.id,
            postaNombre: asignacion.posta.nombre,
            actividadNombre: actividad.nombre,
            plantillaModo: (asignacion.posta.template?.modo ?? null) as "CRITERIOS" | "PUNTAJE_UNICO" | null,
            totalPatrullas,
            enviadas,
            borradores,
            sinCargar: totalPatrullas - enviadas - borradores,
          })
        }
      }

      return result
    },
    [`listPostasParaJuez:${organizationId}:${eventoId}:${userId}:${isAdmin}`],
    { tags: [cacheTags.scoreSheets(organizationId), cacheTags.eventos(organizationId)] },
  )()
}

export type PatrullaPostaRow = {
  patrullaId: string
  patrullaNombre: string
  grupoScoutNombre: string
  scoreSheet: {
    id: string
    estado: ScoreSheetEstado
    puntajeMostrado: Decimal | null
    enviadaAt: Date | null
  } | null
}

export function listPatrullasParaPosta(
  organizationId: string,
  asignacionId: string,
  userId: string,
  isAdmin: boolean,
) {
  return unstable_cache(
    async (): Promise<PatrullaPostaRow[]> => {
      const asignacion = await prisma.asignacionPosta.findFirst({
        where: { id: asignacionId, actividad: { evento: { organizationId } } },
        include: {
          actividad: { select: { eventoId: true, evento: { select: { estado: true } } } },
        },
      })
      if (!asignacion) throw new BusinessError("ASIGNACION_NO_ENCONTRADA")
      if (!isAdmin && asignacion.juezUserId !== userId) throw new BusinessError("FORBIDDEN_NO_ASIGNADO")

      const patrullas = await prisma.patrulla.findMany({
        where: { eventoId: asignacion.actividad.eventoId },
        include: {
          grupoScout: { select: { nombre: true } },
          scoreSheets: {
            where: { asignacionPostaId: asignacionId },
            select: { id: true, estado: true, totalPuntuable: true, enviadaAt: true },
          },
        },
        orderBy: { nombre: "asc" },
      })

      return patrullas.map((p) => {
        const sheet = p.scoreSheets[0] ?? null
        return {
          patrullaId: p.id,
          patrullaNombre: p.nombre,
          grupoScoutNombre: p.grupoScout.nombre,
          scoreSheet: sheet
            ? {
                id: sheet.id,
                estado: sheet.estado,
                puntajeMostrado: sheet.estado === "ENVIADA" ? sheet.totalPuntuable : null,
                enviadaAt: sheet.enviadaAt,
              }
            : null,
        }
      })
    },
    [`listPatrullasParaPosta:${organizationId}:${asignacionId}:${userId}:${isAdmin}`],
    { tags: [cacheTags.scoreSheets(organizationId)] },
  )()
}

export type ScoreSheetForJuez = {
  scoreSheet: {
    id: string
    estado: ScoreSheetEstado
    puntajeUnico: Decimal | null
    entries: { criterionId: string; valor: Decimal }[]
    enviadaAt: Date | null
    totalPuntuable: Decimal | null
    totalDesempate: Decimal | null
  } | null
  asignacion: {
    id: string
    weight: Decimal
    juezUserId: string | null
    postaNombre: string
    actividadNombre: string
    eventoNombre: string
    eventoId: string
    template: {
      id: string
      modo: "CRITERIOS" | "PUNTAJE_UNICO"
      valoresValidos: Decimal[]
      valoresValidosDesempate: Decimal[]
      criterios: { id: string; nombre: string; descripcion: string | null; tipo: "PUNTUABLE" | "DESEMPATE"; orden: number }[]
    } | null
  }
}

export function findScoreSheetForJuez(
  organizationId: string,
  asignacionId: string,
  patrullaId: string,
  userId: string,
  isAdmin: boolean,
) {
  return unstable_cache(
    async (): Promise<ScoreSheetForJuez> => {
      const asignacion = await prisma.asignacionPosta.findFirst({
        where: { id: asignacionId, actividad: { evento: { organizationId } } },
        include: {
          actividad: { include: { evento: { select: { id: true, nombre: true, estado: true } } } },
          posta: {
            include: {
              template: { include: { criterios: { orderBy: { orden: "asc" } } } },
            },
          },
        },
      })
      if (!asignacion) throw new BusinessError("ASIGNACION_NO_ENCONTRADA")
      if (!isAdmin && asignacion.juezUserId !== userId) throw new BusinessError("FORBIDDEN_NO_ASIGNADO")

      const sheet = await prisma.scoreSheet.findUnique({
        where: { asignacionPostaId_patrullaId: { asignacionPostaId: asignacionId, patrullaId } },
        include: { entries: { select: { criterionId: true, valor: true } } },
      })

      const template = asignacion.posta.template

      return {
        scoreSheet: sheet
          ? {
              id: sheet.id,
              estado: sheet.estado,
              puntajeUnico: sheet.puntajeUnico,
              entries: sheet.entries,
              enviadaAt: sheet.enviadaAt,
              totalPuntuable: sheet.totalPuntuable,
              totalDesempate: sheet.totalDesempate,
            }
          : null,
        asignacion: {
          id: asignacion.id,
          weight: asignacion.weight,
          juezUserId: asignacion.juezUserId,
          postaNombre: asignacion.posta.nombre,
          actividadNombre: asignacion.actividad.nombre,
          eventoNombre: asignacion.actividad.evento.nombre,
          eventoId: asignacion.actividad.evento.id,
          template: template
            ? {
                id: template.id,
                modo: template.modo as "CRITERIOS" | "PUNTAJE_UNICO",
                valoresValidos: template.valoresValidos,
                valoresValidosDesempate: template.valoresValidosDesempate,
                criterios: template.criterios.map((c) => ({
                  id: c.id,
                  nombre: c.nombre,
                  descripcion: c.descripcion,
                  tipo: c.tipo as "PUNTUABLE" | "DESEMPATE",
                  orden: c.orden,
                })),
              }
            : null,
        },
      }
    },
    [`findScoreSheetForJuez:${organizationId}:${asignacionId}:${patrullaId}:${userId}:${isAdmin}`],
    { tags: [cacheTags.scoreSheets(organizationId)] },
  )()
}

export type PlanillaEventoAdminRow = {
  patrullaId: string
  patrullaNombre: string
  grupoScoutNombre: string
  scoreSheet: {
    id: string
    estado: ScoreSheetEstado
    totalPuntuable: Decimal | null
    totalDesempate: Decimal | null
    enviadaAt: Date | null
    enviadaByNombre: string | null
    reopenedAt: Date | null
  } | null
}

export type PlanillaEventoAdminGroup = {
  actividadId: string
  actividadNombre: string
  asignacionId: string
  postaNombre: string
  juezNombre: string | null
  plantillaModo: "CRITERIOS" | "PUNTAJE_UNICO" | null
  filas: PlanillaEventoAdminRow[]
}

export function listPlanillasPorEventoAdmin(organizationId: string, eventoId: string) {
  return unstable_cache(
    async (): Promise<PlanillaEventoAdminGroup[]> => {
      const evento = await prisma.evento.findFirst({
        where: { id: eventoId, organizationId },
        include: {
          patrullas: {
            orderBy: { nombre: "asc" },
            include: { grupoScout: { select: { nombre: true } } },
          },
          actividades: {
            orderBy: { orden: "asc" },
            include: {
              asignaciones: {
                orderBy: { orden: "asc" },
                include: {
                  posta: { include: { template: { select: { modo: true } } } },
                  juezUser: { select: { name: true } },
                  scoreSheets: {
                    include: {
                      enviadaBy: { select: { name: true } },
                      reopenedBy: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      })
      if (!evento) throw new BusinessError("NOT_FOUND")

      const result: PlanillaEventoAdminGroup[] = []

      for (const actividad of evento.actividades) {
        for (const asignacion of actividad.asignaciones) {
          const filas: PlanillaEventoAdminRow[] = evento.patrullas.map((patrulla) => {
            const sheet = asignacion.scoreSheets.find((s) => s.patrullaId === patrulla.id) ?? null
            return {
              patrullaId: patrulla.id,
              patrullaNombre: patrulla.nombre,
              grupoScoutNombre: patrulla.grupoScout.nombre,
              scoreSheet: sheet
                ? {
                    id: sheet.id,
                    estado: sheet.estado,
                    totalPuntuable: sheet.totalPuntuable,
                    totalDesempate: sheet.totalDesempate,
                    enviadaAt: sheet.enviadaAt,
                    enviadaByNombre: sheet.enviadaBy?.name ?? null,
                    reopenedAt: sheet.reopenedAt,
                  }
                : null,
            }
          })

          result.push({
            actividadId: actividad.id,
            actividadNombre: actividad.nombre,
            asignacionId: asignacion.id,
            postaNombre: asignacion.posta.nombre,
            juezNombre: asignacion.juezUser?.name ?? null,
            plantillaModo: (asignacion.posta.template?.modo ?? null) as "CRITERIOS" | "PUNTAJE_UNICO" | null,
            filas,
          })
        }
      }

      return result
    },
    [`listPlanillasPorEventoAdmin:${organizationId}:${eventoId}`],
    { tags: [cacheTags.scoreSheets(organizationId)] },
  )()
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function saveScoreSheet(
  organizationId: string,
  asignacionId: string,
  patrullaId: string,
  data: SaveScoreSheetData,
  actorUserId: string,
  isAdmin: boolean,
): Promise<{ id: string }> {
  const asignacion = await _findAsignacionAccesible(organizationId, asignacionId, actorUserId, isAdmin)

  _validateValoresEnEscala(asignacion, data)

  // Deduplicar entries por criterionId (último gana)
  const deduplicatedEntries = [
    ...new Map((data.entries ?? []).map((e) => [e.criterionId, e])).values(),
  ]

  const sheet = await prisma.$transaction(async (tx) => {
    // Upsert ScoreSheet
    const existing = await tx.scoreSheet.findUnique({
      where: { asignacionPostaId_patrullaId: { asignacionPostaId: asignacionId, patrullaId } },
    })

    let sheet
    if (existing) {
      sheet = await tx.scoreSheet.update({
        where: { id: existing.id },
        data: {
          puntajeUnico: data.puntajeUnico ?? null,
          // Preservar estado y totales si ya estaba ENVIADA (reabierta sin guardar aún = BORRADOR)
        },
      })
      // Reemplazar entries en bloque
      await tx.scoreEntry.deleteMany({ where: { scoreSheetId: existing.id } })
    } else {
      sheet = await tx.scoreSheet.create({
        data: {
          asignacionPostaId: asignacionId,
          patrullaId,
          puntajeUnico: data.puntajeUnico ?? null,
        },
      })
    }

    if (deduplicatedEntries.length > 0) {
      await tx.scoreEntry.createMany({
        data: deduplicatedEntries.map((e) => ({
          scoreSheetId: sheet.id,
          criterionId: e.criterionId,
          valor: e.valor,
        })),
      })
    }

    return sheet
  })

  await prisma.auditLog.create({
    data: {
      organizationId,
      actorUserId,
      action: "scoreSheet.saved",
      targetType: "ScoreSheet",
      targetId: sheet.id,
      metadata: { asignacionId, patrullaId },
    },
  })

  revalidateTag(cacheTags.scoreSheets(organizationId))

  return { id: sheet.id }
}

export async function submitScoreSheet(
  organizationId: string,
  asignacionId: string,
  patrullaId: string,
  data: SaveScoreSheetData,
  actorUserId: string,
  isAdmin: boolean,
): Promise<{ id: string; totalPuntuable: Decimal; totalDesempate: Decimal }> {
  const asignacion = await _findAsignacionAccesible(organizationId, asignacionId, actorUserId, isAdmin)

  _validateValoresEnEscala(asignacion, data)

  const { totalPuntuable, totalDesempate } = _calcularTotales(asignacion, data)

  const deduplicatedEntries = [
    ...new Map((data.entries ?? []).map((e) => [e.criterionId, e])).values(),
  ]

  const now = new Date()

  const sheet = await prisma.$transaction(async (tx) => {
    const existing = await tx.scoreSheet.findUnique({
      where: { asignacionPostaId_patrullaId: { asignacionPostaId: asignacionId, patrullaId } },
    })

    let sheet
    if (existing) {
      sheet = await tx.scoreSheet.update({
        where: { id: existing.id },
        data: {
          estado: "ENVIADA",
          puntajeUnico: data.puntajeUnico ?? null,
          totalPuntuable,
          totalDesempate,
          enviadaAt: now,
          enviadaByUserId: actorUserId,
        },
      })
      await tx.scoreEntry.deleteMany({ where: { scoreSheetId: existing.id } })
    } else {
      sheet = await tx.scoreSheet.create({
        data: {
          asignacionPostaId: asignacionId,
          patrullaId,
          estado: "ENVIADA",
          puntajeUnico: data.puntajeUnico ?? null,
          totalPuntuable,
          totalDesempate,
          enviadaAt: now,
          enviadaByUserId: actorUserId,
        },
      })
    }

    if (deduplicatedEntries.length > 0) {
      await tx.scoreEntry.createMany({
        data: deduplicatedEntries.map((e) => ({
          scoreSheetId: sheet.id,
          criterionId: e.criterionId,
          valor: e.valor,
        })),
      })
    }

    return sheet
  })

  await prisma.auditLog.create({
    data: {
      organizationId,
      actorUserId,
      action: "scoreSheet.submitted",
      targetType: "ScoreSheet",
      targetId: sheet.id,
      metadata: {
        asignacionId,
        patrullaId,
        totalPuntuable: totalPuntuable.toString(),
        totalDesempate: totalDesempate.toString(),
      },
    },
  })

  revalidateTag(cacheTags.scoreSheets(organizationId))
  // Invalidar eventos porque isEventoLocked cambia cuando se envía la primera planilla
  revalidateTag(cacheTags.eventos(organizationId))

  return { id: sheet.id, totalPuntuable, totalDesempate }
}

export async function reopenScoreSheet(
  organizationId: string,
  scoreSheetId: string,
  actorUserId: string,
): Promise<void> {
  const sheet = await prisma.scoreSheet.findFirst({
    where: {
      id: scoreSheetId,
      asignacionPosta: { actividad: { evento: { organizationId } } },
    },
  })
  if (!sheet) throw new BusinessError("SCORE_SHEET_NO_ENCONTRADA")
  if (sheet.estado !== "ENVIADA") throw new BusinessError("SCORE_SHEET_NO_ENVIADA")

  await prisma.scoreSheet.update({
    where: { id: scoreSheetId },
    data: {
      estado: "BORRADOR",
      totalPuntuable: null,
      totalDesempate: null,
      reopenedAt: new Date(),
      reopenedByUserId: actorUserId,
    },
  })

  await prisma.auditLog.create({
    data: {
      organizationId,
      actorUserId,
      action: "scoreSheet.reopened",
      targetType: "ScoreSheet",
      targetId: scoreSheetId,
      metadata: {},
    },
  })

  revalidateTag(cacheTags.scoreSheets(organizationId))
  revalidateTag(cacheTags.eventos(organizationId))
}
