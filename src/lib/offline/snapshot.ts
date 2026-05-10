"use client"

import type { SnapshotEntry } from "@/repositories/score-sheet.repo"
import {
  getDB,
  putSnapshotEntries,
  getSnapshotEntry,
  clearSnapshot,
  getMeta,
  setMeta,
} from "./db"

type SnapshotResponse = {
  organizationId: string
  fetchedAt: string
  entries: SnapshotEntry[]
}

// Descarga el snapshot del server y lo persiste en IDB.
// Si el usuario/org cambió, limpia el IDB antes de hidratar.
export async function hydrateSnapshot(currentUserId: string, currentOrgId: string): Promise<void> {
  const storedUserId = await getMeta("userId")
  const storedOrgId = await getMeta("organizationId")

  // Si cambió el usuario u org, wipe completo del snapshot
  if (storedUserId !== currentUserId || storedOrgId !== currentOrgId) {
    await clearSnapshot()
  }

  const res = await fetch("/api/juez/snapshot")
  if (!res.ok) throw new Error(`Snapshot fetch failed: ${res.status}`)

  const data: SnapshotResponse = await res.json()
  const fetchedAt = data.fetchedAt

  await putSnapshotEntries(data.entries.map((e) => ({ ...e, fetchedAt })))

  await setMeta("userId", currentUserId)
  await setMeta("organizationId", currentOrgId)
  await setMeta("lastSnapshotAt", fetchedAt)
}

export async function readSnapshot(
  asignacionId: string,
  patrullaId: string,
): Promise<(SnapshotEntry & { fetchedAt: string }) | undefined> {
  return getSnapshotEntry(asignacionId, patrullaId)
}

// ─── Derived readers for client components ────────────────────────────────────

export type EventoSummary = {
  id: string
  nombre: string
  lugar: string | null
  fechaInicio: string // ISO
  postasCount: number // distinct asignacionIds
}

export type PostaSummary = {
  asignacionId: string
  postaNombre: string
  actividadNombre: string
  plantillaModo: "CRITERIOS" | "PUNTAJE_UNICO" | null
  totalPatrullas: number
  enviadas: number
  borradores: number
  sinCargar: number
}

export type PostaJuezContextOffline = {
  eventoId: string
  eventoNombre: string
  postas: PostaSummary[]
}

export type PatrullaPostaRowOffline = {
  patrullaId: string
  patrullaNombre: string
  grupoScoutNombre: string
  scoreSheet: {
    estado: "BORRADOR" | "ENVIADA"
    puntajeMostrado: number | null
  } | null
}

export type PatrullaPostaContextOffline = {
  eventoId: string
  eventoNombre: string
  postaNombre: string
  actividadNombre: string
  patrullas: PatrullaPostaRowOffline[]
}

export async function readEventosFromSnapshot(): Promise<EventoSummary[]> {
  const db = await getDB()
  const all = await db.getAll("snapshot")

  if (all.length === 0) return []

  const eventoMap = new Map<string, {
    nombre: string
    lugar: string | null
    fechaInicio: string
    asignacionIds: Set<string>
  }>()

  for (const entry of all) {
    if (!eventoMap.has(entry.eventoId)) {
      eventoMap.set(entry.eventoId, {
        nombre: entry.evento.nombre,
        lugar: entry.evento.lugar,
        fechaInicio: entry.evento.fechaInicio,
        asignacionIds: new Set(),
      })
    }
    eventoMap.get(entry.eventoId)!.asignacionIds.add(entry.asignacionId)
  }

  return Array.from(eventoMap.entries()).map(([id, e]) => ({
    id,
    nombre: e.nombre,
    lugar: e.lugar,
    fechaInicio: e.fechaInicio,
    postasCount: e.asignacionIds.size,
  }))
}

export async function readPostasFromSnapshot(eventoId: string): Promise<PostaJuezContextOffline | null> {
  const db = await getDB()
  const entries = await db.getAllFromIndex("snapshot", "by-eventoId", eventoId)

  if (entries.length === 0) return null

  const first = entries[0]
  const totalPatrullas = new Set(entries.map((e) => e.patrullaId)).size

  const postaMap = new Map<string, {
    postaNombre: string
    actividadNombre: string
    plantillaModo: "CRITERIOS" | "PUNTAJE_UNICO" | null
    rows: typeof entries
  }>()

  for (const entry of entries) {
    if (!postaMap.has(entry.asignacionId)) {
      postaMap.set(entry.asignacionId, {
        postaNombre: entry.posta.nombre,
        actividadNombre: entry.actividad.nombre,
        plantillaModo: (entry.template?.modo ?? null) as "CRITERIOS" | "PUNTAJE_UNICO" | null,
        rows: [],
      })
    }
    postaMap.get(entry.asignacionId)!.rows.push(entry)
  }

  const postas: PostaSummary[] = Array.from(postaMap.entries()).map(([asignacionId, posta]) => {
    const enviadas = posta.rows.filter((e) => e.scoreSheet?.estado === "ENVIADA").length
    const borradores = posta.rows.filter((e) => e.scoreSheet?.estado === "BORRADOR").length
    return {
      asignacionId,
      postaNombre: posta.postaNombre,
      actividadNombre: posta.actividadNombre,
      plantillaModo: posta.plantillaModo,
      totalPatrullas,
      enviadas,
      borradores,
      sinCargar: totalPatrullas - enviadas - borradores,
    }
  })

  return { eventoId: first.eventoId, eventoNombre: first.evento.nombre, postas }
}

export async function readPatrullasFromSnapshot(asignacionId: string): Promise<PatrullaPostaContextOffline | null> {
  const db = await getDB()
  const entries = await db.getAllFromIndex("snapshot", "by-asignacionId", asignacionId)

  if (entries.length === 0) return null

  const first = entries[0]

  const patrullas: PatrullaPostaRowOffline[] = entries
    .map((entry) => ({
      patrullaId: entry.patrullaId,
      patrullaNombre: entry.patrulla.nombre,
      grupoScoutNombre: entry.patrulla.grupoScoutNombre,
      scoreSheet: entry.scoreSheet
        ? {
            estado: entry.scoreSheet.estado,
            puntajeMostrado: entry.scoreSheet.estado === "ENVIADA" ? entry.scoreSheet.totalPuntuable : null,
          }
        : null,
    }))
    .sort((a, b) => a.patrullaNombre.localeCompare(b.patrullaNombre, "es"))

  return {
    eventoId: first.eventoId,
    eventoNombre: first.evento.nombre,
    postaNombre: first.posta.nombre,
    actividadNombre: first.actividad.nombre,
    patrullas,
  }
}
