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

// ─── Snapshot para PWA offline (Plan 7b) ─────────────────────────────────────

export type SnapshotEntry = {
  asignacionId: string
  patrullaId: string
  eventoId: string
  evento: {
    nombre: string
    lugar: string | null
    fechaInicio: string // ISO
  }
  actividad: {
    id: string
    nombre: string
  }
  patrulla: { nombre: string; grupoScoutNombre: string }
  posta: { nombre: string; descripcion: string | null }
  template: {
    id: string
    modo: "CRITERIOS" | "PUNTAJE_UNICO"
    valoresValidos: number[]
    valoresValidosDesempate: number[]
    criterios: { id: string; nombre: string; descripcion: string | null; tipo: "PUNTUABLE" | "DESEMPATE"; orden: number }[]
  } | null
  scoreSheet: {
    id: string
    estado: "BORRADOR" | "ENVIADA"
    version: number
    puntajeUnico: number | null
    entries: { criterionId: string; valor: number }[]
    enviadaAt: string | null
    totalPuntuable: number | null
    totalDesempate: number | null
  } | null
}

export async function getSnapshotParaJuez(
  organizationId: string,
  userId: string,
  isAdmin: boolean,
): Promise<SnapshotEntry[]> {
  const eventos = await prisma.evento.findMany({
    where: {
      organizationId,
      estado: "ACTIVO",
      actividades: isAdmin
        ? undefined
        : { some: { asignaciones: { some: { juezUserId: userId } } } },
    },
    include: {
      patrullas: { include: { grupoScout: { select: { nombre: true } } } },
      actividades: {
        include: {
          asignaciones: {
            where: isAdmin ? {} : { juezUserId: userId },
            include: {
              posta: {
                include: {
                  template: { include: { criterios: { orderBy: { orden: "asc" } } } },
                },
              },
              scoreSheets: {
                include: { entries: { select: { criterionId: true, valor: true } } },
              },
            },
          },
        },
      },
    },
  })

  const entries: SnapshotEntry[] = []

  for (const evento of eventos) {
    for (const actividad of evento.actividades) {
      for (const asignacion of actividad.asignaciones) {
        const template = asignacion.posta.template
        for (const patrulla of evento.patrullas) {
          const sheet = asignacion.scoreSheets.find((s) => s.patrullaId === patrulla.id) ?? null
          entries.push({
            asignacionId: asignacion.id,
            patrullaId: patrulla.id,
            eventoId: evento.id,
            evento: {
              nombre: evento.nombre,
              lugar: evento.lugar,
              fechaInicio: evento.fechaInicio.toISOString(),
            },
            actividad: {
              id: actividad.id,
              nombre: actividad.nombre,
            },
            patrulla: { nombre: patrulla.nombre, grupoScoutNombre: patrulla.grupoScout.nombre },
            posta: { nombre: asignacion.posta.nombre, descripcion: asignacion.posta.descripcion },
            template: template
              ? {
                  id: template.id,
                  modo: template.modo as "CRITERIOS" | "PUNTAJE_UNICO",
                  valoresValidos: template.valoresValidos.map(Number),
                  valoresValidosDesempate: template.valoresValidosDesempate.map(Number),
                  criterios: template.criterios.map((c) => ({
                    id: c.id,
                    nombre: c.nombre,
                    descripcion: c.descripcion,
                    tipo: c.tipo as "PUNTUABLE" | "DESEMPATE",
                    orden: c.orden,
                  })),
                }
              : null,
            scoreSheet: sheet
              ? {
                  id: sheet.id,
                  estado: sheet.estado as "BORRADOR" | "ENVIADA",
                  version: sheet.version,
                  puntajeUnico: sheet.puntajeUnico != null ? Number(sheet.puntajeUnico) : null,
                  entries: sheet.entries.map((e) => ({ criterionId: e.criterionId, valor: Number(e.valor) })),
                  enviadaAt: sheet.enviadaAt?.toISOString() ?? null,
                  totalPuntuable: sheet.totalPuntuable != null ? Number(sheet.totalPuntuable) : null,
                  totalDesempate: sheet.totalDesempate != null ? Number(sheet.totalDesempate) : null,
                }
              : null,
          })
        }
      }
    }
  }

  return entries
}

// ─── Sync meta (Plan 7b) ──────────────────────────────────────────────────────

export type SyncMeta = {
  expectedVersion?: number   // si está definido, se valida contra ScoreSheet.version
  clientId?: string          // UUID del dispositivo
  clientSubmittedAt?: Date   // timestamp local del cliente
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function saveScoreSheet(
  organizationId: string,
  asignacionId: string,
  patrullaId: string,
  data: SaveScoreSheetData,
  actorUserId: string,
  isAdmin: boolean,
  syncMeta?: SyncMeta,
): Promise<{ id: string; version: number }> {
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

    // Version check (solo cuando el cliente envía expectedVersion explícito)
    if (syncMeta?.expectedVersion !== undefined) {
      const currentVersion = existing?.version ?? 0
      if (currentVersion !== syncMeta.expectedVersion) {
        throw new BusinessError("VERSION_CONFLICT", {
          currentVersion: existing?.version ?? 0,
          scoreSheetId: existing?.id ?? null,
          estado: existing?.estado ?? null,
          enviadaAt: existing?.enviadaAt?.toISOString() ?? null,
          reopenedAt: existing?.reopenedAt?.toISOString() ?? null,
        })
      }
    }

    let sheet
    if (existing) {
      sheet = await tx.scoreSheet.update({
        where: { id: existing.id },
        data: {
          puntajeUnico: data.puntajeUnico ?? null,
          version: { increment: 1 },
          clientId: syncMeta?.clientId,
          clientSubmittedAt: syncMeta?.clientSubmittedAt,
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
          version: 1,
          clientId: syncMeta?.clientId,
          clientSubmittedAt: syncMeta?.clientSubmittedAt,
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

  return { id: sheet.id, version: sheet.version }
}

export async function submitScoreSheet(
  organizationId: string,
  asignacionId: string,
  patrullaId: string,
  data: SaveScoreSheetData,
  actorUserId: string,
  isAdmin: boolean,
  syncMeta?: SyncMeta,
): Promise<{ id: string; version: number; totalPuntuable: Decimal; totalDesempate: Decimal }> {
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

    // Version check (solo cuando el cliente envía expectedVersion explícito)
    if (syncMeta?.expectedVersion !== undefined) {
      const currentVersion = existing?.version ?? 0
      if (currentVersion !== syncMeta.expectedVersion) {
        throw new BusinessError("VERSION_CONFLICT", {
          currentVersion: existing?.version ?? 0,
          scoreSheetId: existing?.id ?? null,
          estado: existing?.estado ?? null,
          enviadaAt: existing?.enviadaAt?.toISOString() ?? null,
          reopenedAt: existing?.reopenedAt?.toISOString() ?? null,
        })
      }
    }

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
          version: { increment: 1 },
          clientId: syncMeta?.clientId,
          clientSubmittedAt: syncMeta?.clientSubmittedAt,
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
          version: 1,
          clientId: syncMeta?.clientId,
          clientSubmittedAt: syncMeta?.clientSubmittedAt,
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
  revalidateTag(cacheTags.leaderboard(organizationId))

  return { id: sheet.id, version: sheet.version, totalPuntuable, totalDesempate }
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
      version: { increment: 1 }, // invalida ops pendientes del cliente
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
  revalidateTag(cacheTags.leaderboard(organizationId))
}
