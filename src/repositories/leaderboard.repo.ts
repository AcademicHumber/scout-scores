import { unstable_cache, revalidateTag } from "next/cache"
import { prisma } from "@/lib/db"
import { cacheTags } from "./cache-tags"
import { Decimal } from "@prisma/client/runtime/client"
import type { EventLeaderboardSnapshot } from "@/generated/prisma/client"

// ─── Types ────────────────────────────────────────────────────────────────────

export type LeaderboardPostaBreakdown = {
  asignacionId: string
  postaNombre: string
  weight: number
  totalPuntuable: number | null
  totalDesempate: number | null
}

export type LeaderboardActividadBreakdown = {
  actividadId: string
  actividadNombre: string
  pesoRelativo: number
  subtotalActividad: number
  postas: LeaderboardPostaBreakdown[]
}

export type LeaderboardRow = {
  posicion: number
  patrullaId: string
  patrullaNombre: string
  grupoScoutId: string
  grupoScoutNombre: string
  totalPuntuable: number
  totalDesempate: number
  detalle: LeaderboardActividadBreakdown[]
}

export type LeaderboardSnapshotData = {
  eventoNombre: string
  eventoLugar: string | null
  eventoFechaInicio: string
  eventoFechaFin: string | null
  organizationNombre: string
  generadoEn: string
  ranking: LeaderboardRow[]
  grupos: { id: string; nombre: string }[]
}

export type EventLeaderboardSnapshotWithData = EventLeaderboardSnapshot & {
  data: LeaderboardSnapshotData
}

// ─── Algoritmo interno (sin cache) ───────────────────────────────────────────

async function _computeLeaderboardInner(
  organizationId: string,
  eventoId: string,
): Promise<LeaderboardSnapshotData> {
  const evento = await prisma.evento.findFirst({
    where: { id: eventoId, organizationId },
    include: {
      organization: { select: { nombre: true } },
      actividades: {
        orderBy: { orden: "asc" },
        include: {
          asignaciones: {
            orderBy: { orden: "asc" },
            include: {
              posta: { select: { id: true, nombre: true } },
              scoreSheets: {
                where: { estado: "ENVIADA" },
                select: {
                  patrullaId: true,
                  totalPuntuable: true,
                  totalDesempate: true,
                },
              },
            },
          },
        },
      },
      patrullas: {
        orderBy: { createdAt: "asc" },
        include: { grupoScout: { select: { id: true, nombre: true } } },
      },
    },
  })

  if (!evento) {
    throw new Error(`Evento no encontrado: ${eventoId}`)
  }

  // Calcular ranking por patrulla
  const rawRows: Omit<LeaderboardRow, "posicion">[] = evento.patrullas.map((patrulla) => {
    let totalPuntuable = new Decimal(0)
    let totalDesempate = new Decimal(0)
    const detalle: LeaderboardActividadBreakdown[] = []

    for (const actividad of evento.actividades) {
      let subtotalActividad = new Decimal(0)
      const postas: LeaderboardPostaBreakdown[] = []

      for (const asignacion of actividad.asignaciones) {
        const sheet = asignacion.scoreSheets.find((s) => s.patrullaId === patrulla.id)

        const postaPuntuable = sheet?.totalPuntuable ?? null
        const postaDesempate = sheet?.totalDesempate ?? null

        // subtotal posta = puntuable × weight (null cuenta como 0)
        const contribucion = postaPuntuable !== null
          ? new Decimal(postaPuntuable).times(asignacion.weight)
          : new Decimal(0)

        subtotalActividad = subtotalActividad.plus(contribucion)

        // desempate sin weight
        if (postaDesempate !== null) {
          totalDesempate = totalDesempate.plus(postaDesempate)
        }

        postas.push({
          asignacionId: asignacion.id,
          postaNombre: asignacion.posta.nombre,
          weight: Number(asignacion.weight),
          totalPuntuable: postaPuntuable !== null ? Number(postaPuntuable) : null,
          totalDesempate: postaDesempate !== null ? Number(postaDesempate) : null,
        })
      }

      // Aplicar peso porcentual de la actividad
      const subtotalPonderado = subtotalActividad.times(actividad.pesoRelativo).dividedBy(100)
      totalPuntuable = totalPuntuable.plus(subtotalPonderado)

      detalle.push({
        actividadId: actividad.id,
        actividadNombre: actividad.nombre,
        pesoRelativo: Number(actividad.pesoRelativo),
        subtotalActividad: Number(subtotalPonderado),
        postas,
      })
    }

    return {
      patrullaId: patrulla.id,
      patrullaNombre: patrulla.nombre,
      grupoScoutId: patrulla.grupoScout.id,
      grupoScoutNombre: patrulla.grupoScout.nombre,
      totalPuntuable: Number(totalPuntuable),
      totalDesempate: Number(totalDesempate),
      detalle,
    }
  })

  // Ordenar: DESC puntuable, DESC desempate, ASC nombre
  rawRows.sort((a, b) => {
    if (b.totalPuntuable !== a.totalPuntuable) return b.totalPuntuable - a.totalPuntuable
    if (b.totalDesempate !== a.totalDesempate) return b.totalDesempate - a.totalDesempate
    return a.patrullaNombre.localeCompare(b.patrullaNombre)
  })

  // Asignar posición con empate compartido
  const ranking: LeaderboardRow[] = []
  for (let idx = 0; idx < rawRows.length; idx++) {
    const row = rawRows[idx]!
    let posicion: number
    if (idx === 0) {
      posicion = 1
    } else {
      const prev = rawRows[idx - 1]!
      if (
        row.totalPuntuable === prev.totalPuntuable &&
        row.totalDesempate === prev.totalDesempate
      ) {
        posicion = ranking[idx - 1]!.posicion
      } else {
        posicion = idx + 1
      }
    }
    ranking.push({ ...row, posicion })
  }

  // Construir lista de grupos únicos
  const gruposMap = new Map<string, string>()
  for (const patrulla of evento.patrullas) {
    gruposMap.set(patrulla.grupoScout.id, patrulla.grupoScout.nombre)
  }
  const grupos = Array.from(gruposMap.entries())
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  return {
    eventoNombre: evento.nombre,
    eventoLugar: evento.lugar,
    eventoFechaInicio: evento.fechaInicio.toISOString(),
    eventoFechaFin: evento.fechaFin?.toISOString() ?? null,
    organizationNombre: evento.organization.nombre,
    generadoEn: new Date().toISOString(),
    ranking,
    grupos,
  }
}

// ─── Reads (cacheados) ────────────────────────────────────────────────────────

export function computeLeaderboard(
  organizationId: string,
  eventoId: string,
): Promise<LeaderboardSnapshotData> {
  return unstable_cache(
    () => _computeLeaderboardInner(organizationId, eventoId),
    ["leaderboard", organizationId, eventoId],
    { tags: [cacheTags.leaderboard(organizationId)] },
  )()
}

export function getLeaderboardSnapshot(
  organizationId: string,
  eventoId: string,
): Promise<EventLeaderboardSnapshotWithData | null> {
  return unstable_cache(
    async () => {
      const snapshot = await prisma.eventLeaderboardSnapshot.findUnique({
        where: { eventoId },
      })
      if (!snapshot || snapshot.organizationId !== organizationId) return null
      return snapshot as EventLeaderboardSnapshotWithData
    },
    ["leaderboard-snapshot", organizationId, eventoId],
    { tags: [cacheTags.leaderboard(organizationId)] },
  )()
}

export async function isSnapshotStale(
  organizationId: string,
  eventoId: string,
): Promise<boolean> {
  const snapshot = await prisma.eventLeaderboardSnapshot.findUnique({
    where: { eventoId },
  })
  if (!snapshot || snapshot.organizationId !== organizationId) return false

  const agg = await prisma.scoreSheet.aggregate({
    where: { asignacionPosta: { actividad: { eventoId } } },
    _max: { updatedAt: true },
  })
  const lastSheetUpdate = agg._max.updatedAt
  if (!lastSheetUpdate) return false

  return lastSheetUpdate > snapshot.generatedAt
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function generateLeaderboardSnapshot(
  organizationId: string,
  eventoId: string,
  actorUserId: string,
): Promise<{ generatedAt: Date }> {
  const data = await _computeLeaderboardInner(organizationId, eventoId)
  // Actualizar generadoEn al timestamp actual
  data.generadoEn = new Date().toISOString()

  const now = new Date()

  const snapshot = await prisma.eventLeaderboardSnapshot.upsert({
    where: { eventoId },
    create: {
      eventoId,
      organizationId,
      data: data as object,
      generatedAt: now,
      generatedByUserId: actorUserId,
    },
    update: {
      data: data as object,
      generatedAt: now,
      generatedByUserId: actorUserId,
    },
  })

  await prisma.auditLog.create({
    data: {
      organizationId,
      actorUserId,
      action: "evento.leaderboardSnapshotGenerated",
      targetType: "Evento",
      targetId: eventoId,
      metadata: { generatedAt: now.toISOString() },
    },
  })

  revalidateTag(cacheTags.leaderboard(organizationId))

  return { generatedAt: snapshot.generatedAt }
}
