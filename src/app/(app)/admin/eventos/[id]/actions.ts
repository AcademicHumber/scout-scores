"use server"

import { z } from "zod"
import { requireRole } from "@/lib/auth-helpers"
import {
  updateEventoMetadata,
  transicionarEstado,
  addActividad,
  updateActividad,
  deleteActividad,
  reorderActividad,
} from "@/repositories/evento.repo"
import {
  createPosta,
  updatePosta,
  deletePosta,
  reorderPosta,
  assignTemplate,
  assignJuez,
} from "@/repositories/posta.repo"
import {
  createPatrulla,
  updatePatrulla,
  deletePatrulla,
} from "@/repositories/patrulla.repo"
import { BusinessError } from "@/lib/errors"
import { Decimal } from "@prisma/client/runtime/client"
import type { EventoEstado, ActividadTipo, PatrullaCategoria } from "@/generated/prisma/enums"

// ─── updateMetadata ───────────────────────────────────────────────────────────

const UpdateMetadataSchema = z
  .object({
    nombre: z.string().trim().min(2).max(100),
    descripcion: z.string().trim().max(1000).optional(),
    lugar: z.string().trim().max(200).optional(),
    fechaInicio: z.string().min(1),
    fechaFin: z.string().optional(),
  })
  .refine(
    (d) => {
      if (d.fechaFin && d.fechaFin !== "") return new Date(d.fechaFin) >= new Date(d.fechaInicio)
      return true
    },
    { message: "fechaInvalida", path: ["fechaFin"] },
  )

export type UpdateMetadataState = { error?: string; fieldErrors?: Record<string, string[]> }

export async function updateMetadataAction(
  _prev: UpdateMetadataState,
  formData: FormData,
): Promise<UpdateMetadataState> {
  const org = await requireRole(["ADMIN"])
  const id = formData.get("id") as string

  const raw = {
    nombre: formData.get("nombre") as string,
    descripcion: formData.get("descripcion") as string || undefined,
    lugar: formData.get("lugar") as string || undefined,
    fechaInicio: formData.get("fechaInicio") as string,
    fechaFin: formData.get("fechaFin") as string || undefined,
  }

  const result = UpdateMetadataSchema.safeParse(raw)
  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { nombre, descripcion, lugar, fechaInicio, fechaFin } = result.data

  try {
    await updateEventoMetadata(
      org.organizationId,
      id,
      {
        nombre,
        descripcion: descripcion || undefined,
        lugar: lugar || undefined,
        fechaInicio: new Date(fechaInicio),
        fechaFin: fechaFin && fechaFin !== "" ? new Date(fechaFin) : undefined,
      },
      org.userId,
    )
    return {}
  } catch (err) {
    if (err instanceof BusinessError) {
      if (err.code === "FECHA_INVALIDA") return { error: "La fecha de fin debe ser igual o posterior a la fecha de inicio" }
      if (err.code === "NOT_FOUND") return { error: "Evento no encontrado" }
    }
    throw err
  }
}

// ─── transicionarEstado ───────────────────────────────────────────────────────

type PreActivacionError = { code: string; meta?: Record<string, unknown> }

export type TransicionarEstadoState = {
  error?: string
  pesosError?: { sumaActual: number; faltante: number; sinActividades?: boolean }
  preActivacionErrores?: PreActivacionError[]
}

function buildPreActivacionMessage(errores: PreActivacionError[]): string {
  const lines: string[] = ["No se puede activar el evento. Resolvé estos puntos:"]
  for (const e of errores) {
    if (e.code === "PESOS_INVALIDOS") {
      const meta = e.meta as { sumaActual?: number; faltante?: number; sinActividades?: boolean }
      if (meta.sinActividades) {
        lines.push("• Agregá al menos una actividad")
      } else {
        lines.push(`• Los pesos deben sumar 100% (actual: ${(meta.sumaActual ?? 0).toFixed(2)}%, falta: ${(meta.faltante ?? 0).toFixed(2)}%)`)
      }
    } else if (e.code === "ACTIVIDAD_SIN_POSTAS") {
      const meta = e.meta as { actividades: Array<{ nombre: string }> }
      const nombres = meta.actividades.map((a) => `"${a.nombre}"`).join(", ")
      const count = meta.actividades.length
      lines.push(count === 1
        ? `• 1 actividad sin postas: ${nombres}`
        : `• ${count} actividades sin postas: ${nombres}`)
    } else if (e.code === "POSTA_SIN_PLANTILLA") {
      const meta = e.meta as { postas: Array<{ nombre: string; actividadNombre: string }> }
      const count = meta.postas.length
      const nombres = meta.postas.map((p) => `"${p.nombre}" (en ${p.actividadNombre})`).join(", ")
      lines.push(count === 1
        ? `• 1 posta sin plantilla: ${nombres}`
        : `• ${count} postas sin plantilla: ${nombres}`)
    } else if (e.code === "EVENTO_SIN_PATRULLAS") {
      lines.push("• El evento no tiene patrullas inscritas")
    }
  }
  return lines.join("\n")
}

export async function transicionarEstadoAction(
  _prev: TransicionarEstadoState,
  formData: FormData,
): Promise<TransicionarEstadoState> {
  const org = await requireRole(["ADMIN"])
  const id = formData.get("id") as string
  const target = formData.get("target") as EventoEstado

  try {
    await transicionarEstado(org.organizationId, id, target, org.userId)
    return {}
  } catch (err) {
    if (err instanceof BusinessError) {
      if (err.code === "PRE_ACTIVACION_INCOMPLETA") {
        const meta = err.meta as { errores: PreActivacionError[] }
        return { error: buildPreActivacionMessage(meta.errores) }
      }
      if (err.code === "PESOS_INVALIDOS") {
        const meta = err.meta as { sumaActual: number; faltante: number; sinActividades?: boolean }
        return { pesosError: meta }
      }
      if (err.code === "INVALID_TRANSITION") return { error: "La transición de estado solicitada no es válida" }
      if (err.code === "NOT_FOUND") return { error: "Evento no encontrado" }
    }
    throw err
  }
}

// ─── addActividad ─────────────────────────────────────────────────────────────

const ActividadSchema = z.object({
  nombre: z.string().trim().min(1).max(100),
  descripcion: z.string().trim().max(1000).optional(),
  tipo: z.enum(["COMPETICION", "CONSTRUCCION", "COCINA", "OTRO"]),
  pesoRelativo: z.string().refine((v) => {
    const n = parseFloat(v)
    return !isNaN(n) && n >= 0.01 && n <= 100
  }, "El peso debe ser entre 0.01 y 100"),
})

export type ActividadState = { error?: string; fieldErrors?: Record<string, string[]>; actividad?: { id: string; nombre: string; descripcion: string | null; tipo: ActividadTipo; pesoRelativo: string; orden: number } }

export async function addActividadAction(
  _prev: ActividadState,
  formData: FormData,
): Promise<ActividadState> {
  const org = await requireRole(["ADMIN"])
  const eventoId = formData.get("eventoId") as string

  const raw = {
    nombre: formData.get("nombre") as string,
    descripcion: formData.get("descripcion") as string || undefined,
    tipo: formData.get("tipo") as string,
    pesoRelativo: formData.get("pesoRelativo") as string,
  }

  const result = ActividadSchema.safeParse(raw)
  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    await addActividad(
      org.organizationId,
      eventoId,
      {
        nombre: result.data.nombre,
        descripcion: result.data.descripcion,
        tipo: result.data.tipo as ActividadTipo,
        pesoRelativo: new Decimal(result.data.pesoRelativo),
      },
      org.userId,
    )
    return {}
  } catch (err) {
    if (err instanceof BusinessError) {
      if (err.code === "EVENTO_LOCKED") return { error: "El evento ya tiene puntajes cargados; no se pueden modificar las actividades" }
      if (err.code === "NOT_FOUND") return { error: "Evento no encontrado" }
    }
    throw err
  }
}

export async function updateActividadAction(
  _prev: ActividadState,
  formData: FormData,
): Promise<ActividadState> {
  const org = await requireRole(["ADMIN"])
  const eventoId = formData.get("eventoId") as string
  const actividadId = formData.get("actividadId") as string

  const raw = {
    nombre: formData.get("nombre") as string,
    descripcion: formData.get("descripcion") as string || undefined,
    tipo: formData.get("tipo") as string,
    pesoRelativo: formData.get("pesoRelativo") as string,
  }

  const result = ActividadSchema.safeParse(raw)
  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    const updated = await updateActividad(
      org.organizationId,
      eventoId,
      actividadId,
      {
        nombre: result.data.nombre,
        descripcion: result.data.descripcion,
        tipo: result.data.tipo as ActividadTipo,
        pesoRelativo: new Decimal(result.data.pesoRelativo),
      },
      org.userId,
    )
    return {
      actividad: {
        id: updated.id,
        nombre: updated.nombre,
        descripcion: updated.descripcion,
        tipo: updated.tipo,
        pesoRelativo: updated.pesoRelativo.toString(),
        orden: updated.orden,
      },
    }
  } catch (err) {
    if (err instanceof BusinessError) {
      if (err.code === "EVENTO_LOCKED") return { error: "El evento ya tiene puntajes cargados; no se pueden modificar las actividades" }
      if (err.code === "ACTIVIDAD_NO_ENCONTRADA") return { error: "Actividad no encontrada" }
      if (err.code === "NOT_FOUND") return { error: "Evento no encontrado" }
    }
    throw err
  }
}

// ─── deleteActividad ──────────────────────────────────────────────────────────

export type DeleteActividadState = { error?: string }

export async function deleteActividadAction(
  _prev: DeleteActividadState,
  formData: FormData,
): Promise<DeleteActividadState> {
  const org = await requireRole(["ADMIN"])
  const eventoId = formData.get("eventoId") as string
  const actividadId = formData.get("actividadId") as string

  try {
    await deleteActividad(org.organizationId, eventoId, actividadId, org.userId)
    return {}
  } catch (err) {
    if (err instanceof BusinessError) {
      if (err.code === "EVENTO_LOCKED") return { error: "El evento ya tiene puntajes cargados; no se pueden modificar las actividades" }
      if (err.code === "ACTIVIDAD_NO_ENCONTRADA") return { error: "Actividad no encontrada" }
      if (err.code === "NOT_FOUND") return { error: "Evento no encontrado" }
    }
    throw err
  }
}

// ─── reorderActividad ─────────────────────────────────────────────────────────

export type ReorderActividadState = { error?: string }

export async function reorderActividadAction(
  _prev: ReorderActividadState,
  formData: FormData,
): Promise<ReorderActividadState> {
  const org = await requireRole(["ADMIN"])
  const eventoId = formData.get("eventoId") as string
  const actividadId = formData.get("actividadId") as string
  const direction = formData.get("direction") as "up" | "down"

  try {
    await reorderActividad(org.organizationId, eventoId, actividadId, direction, org.userId)
    return {}
  } catch (err) {
    if (err instanceof BusinessError) {
      if (err.code === "EVENTO_LOCKED") return { error: "El evento ya tiene puntajes cargados; no se pueden modificar las actividades" }
      if (err.code === "ACTIVIDAD_NO_ENCONTRADA") return { error: "Actividad no encontrada" }
      if (err.code === "NOT_FOUND") return { error: "Evento no encontrado" }
    }
    throw err
  }
}

// ─── Postas ───────────────────────────────────────────────────────────────────

const PostaSchema = z.object({
  nombre: z.string().trim().min(2).max(100),
  descripcion: z.string().trim().max(500).optional(),
  weight: z.coerce.number().min(0.01).max(999.99),
})

export type PostaState = {
  error?: string
  fieldErrors?: Record<string, string[]>
  posta?: {
    id: string
    nombre: string
    descripcion: string | null
    weight: string
    templateId: string | null
    template: { id: string; nombre: string; archivedAt: Date | null } | null
    juezUserId: string | null
    juezUser: { id: string; name: string | null; email: string } | null
    orden: number
  }
}

function postaError(code: string): PostaState {
  const map: Record<string, string> = {
    POSTA_NO_ENCONTRADA: "Posta no encontrada",
    ACTIVIDAD_NO_ENCONTRADA: "Actividad no encontrada",
    EVENTO_LOCKED: "El evento ya tiene puntajes cargados; no se pueden modificar las postas",
    NOT_FOUND: "Evento no encontrado",
    PLANTILLA_INVALIDA: "La plantilla seleccionada no es válida o está archivada",
    JUEZ_INVALIDO: "El usuario seleccionado no tiene rol de juez en este distrito",
  }
  return { error: map[code] ?? "Error inesperado" }
}

export async function addPostaAction(
  _prev: PostaState,
  formData: FormData,
): Promise<PostaState> {
  const org = await requireRole(["ADMIN"])
  const actividadId = formData.get("actividadId") as string

  const raw = {
    nombre: formData.get("nombre") as string,
    descripcion: formData.get("descripcion") as string || undefined,
    weight: formData.get("weight") as string,
  }

  const result = PostaSchema.safeParse(raw)
  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    await createPosta(
      org.organizationId,
      actividadId,
      { nombre: result.data.nombre, descripcion: result.data.descripcion, weight: new Decimal(result.data.weight) },
      org.userId,
    )
    return {}
  } catch (err) {
    if (err instanceof BusinessError) return postaError(err.code)
    throw err
  }
}

export async function updatePostaAction(
  _prev: PostaState,
  formData: FormData,
): Promise<PostaState> {
  const org = await requireRole(["ADMIN"])
  const postaId = formData.get("postaId") as string

  const raw = {
    nombre: formData.get("nombre") as string,
    descripcion: formData.get("descripcion") as string || undefined,
    weight: formData.get("weight") as string,
  }

  const result = PostaSchema.safeParse(raw)
  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    const updated = await updatePosta(
      org.organizationId,
      postaId,
      { nombre: result.data.nombre, descripcion: result.data.descripcion, weight: new Decimal(result.data.weight) },
      org.userId,
    )
    return {
      posta: {
        id: updated.id,
        nombre: updated.nombre,
        descripcion: updated.descripcion,
        weight: updated.weight.toString(),
        templateId: updated.templateId,
        template: updated.template,
        juezUserId: updated.juezUserId,
        juezUser: updated.juezUser,
        orden: updated.orden,
      },
    }
  } catch (err) {
    if (err instanceof BusinessError) return postaError(err.code)
    throw err
  }
}

export type DeletePostaState = { error?: string }

export async function deletePostaAction(
  _prev: DeletePostaState,
  formData: FormData,
): Promise<DeletePostaState> {
  const org = await requireRole(["ADMIN"])
  const postaId = formData.get("postaId") as string

  try {
    await deletePosta(org.organizationId, postaId, org.userId)
    return {}
  } catch (err) {
    if (err instanceof BusinessError) return { error: postaError(err.code).error }
    throw err
  }
}

export type ReorderPostaState = { error?: string }

export async function reorderPostaAction(
  _prev: ReorderPostaState,
  formData: FormData,
): Promise<ReorderPostaState> {
  const org = await requireRole(["ADMIN"])
  const postaId = formData.get("postaId") as string
  const direction = formData.get("direction") as "up" | "down"

  try {
    await reorderPosta(org.organizationId, postaId, direction, org.userId)
    return {}
  } catch (err) {
    if (err instanceof BusinessError) return { error: postaError(err.code).error }
    throw err
  }
}

export async function assignTemplateAction(
  _prev: PostaState,
  formData: FormData,
): Promise<PostaState> {
  const org = await requireRole(["ADMIN"])
  const postaId = formData.get("postaId") as string
  const templateIdRaw = formData.get("templateId") as string
  const templateId = templateIdRaw && templateIdRaw !== "" ? templateIdRaw : null

  try {
    const updated = await assignTemplate(org.organizationId, postaId, templateId, org.userId)
    return {
      posta: {
        id: updated.id,
        nombre: updated.nombre,
        descripcion: updated.descripcion,
        weight: updated.weight.toString(),
        templateId: updated.templateId,
        template: updated.template,
        juezUserId: updated.juezUserId,
        juezUser: updated.juezUser,
        orden: updated.orden,
      },
    }
  } catch (err) {
    if (err instanceof BusinessError) return postaError(err.code)
    throw err
  }
}

export async function assignJuezAction(
  _prev: PostaState,
  formData: FormData,
): Promise<PostaState> {
  const org = await requireRole(["ADMIN"])
  const postaId = formData.get("postaId") as string
  const juezUserIdRaw = formData.get("juezUserId") as string
  const juezUserId = juezUserIdRaw && juezUserIdRaw !== "" ? juezUserIdRaw : null

  try {
    const updated = await assignJuez(org.organizationId, postaId, juezUserId, org.userId)
    return {
      posta: {
        id: updated.id,
        nombre: updated.nombre,
        descripcion: updated.descripcion,
        weight: updated.weight.toString(),
        templateId: updated.templateId,
        template: updated.template,
        juezUserId: updated.juezUserId,
        juezUser: updated.juezUser,
        orden: updated.orden,
      },
    }
  } catch (err) {
    if (err instanceof BusinessError) return postaError(err.code)
    throw err
  }
}

// ─── Patrullas ────────────────────────────────────────────────────────────────

const PatrullaSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  grupoScoutId: z.string().min(1),
  categoria: z.enum(["LOBATO", "EXPLORADOR", "PIONERO", "ROVER"]).nullable().optional(),
})

export type PatrullaState = {
  error?: string
  fieldErrors?: Record<string, string[]>
  patrulla?: {
    id: string
    nombre: string
    grupoScoutId: string
    grupoScout: { id: string; nombre: string }
    categoria: PatrullaCategoria | null
  }
}

function patrullaError(code: string): PatrullaState {
  const map: Record<string, string> = {
    PATRULLA_NO_ENCONTRADA: "Patrulla no encontrada",
    PATRULLA_NOMBRE_DUPLICADO: "Ya existe una patrulla con ese nombre en este evento",
    GRUPO_SCOUT_INVALIDO: "El grupo scout seleccionado no pertenece al distrito",
    NOT_FOUND: "Evento no encontrado",
  }
  return { error: map[code] ?? "Error inesperado" }
}

export async function addPatrullaAction(
  _prev: PatrullaState,
  formData: FormData,
): Promise<PatrullaState> {
  const org = await requireRole(["ADMIN"])
  const eventoId = formData.get("eventoId") as string

  const raw = {
    nombre: formData.get("nombre") as string,
    grupoScoutId: formData.get("grupoScoutId") as string,
    categoria: (formData.get("categoria") as string) || null,
  }

  const result = PatrullaSchema.safeParse(raw)
  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    await createPatrulla(
      org.organizationId,
      eventoId,
      { nombre: result.data.nombre, grupoScoutId: result.data.grupoScoutId, categoria: result.data.categoria ?? null },
      org.userId,
    )
    return {}
  } catch (err) {
    if (err instanceof BusinessError) return patrullaError(err.code)
    throw err
  }
}

export async function updatePatrullaAction(
  _prev: PatrullaState,
  formData: FormData,
): Promise<PatrullaState> {
  const org = await requireRole(["ADMIN"])
  const patrullaId = formData.get("patrullaId") as string

  const raw = {
    nombre: formData.get("nombre") as string,
    grupoScoutId: formData.get("grupoScoutId") as string,
    categoria: (formData.get("categoria") as string) || null,
  }

  const result = PatrullaSchema.safeParse(raw)
  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    const updated = await updatePatrulla(
      org.organizationId,
      patrullaId,
      { nombre: result.data.nombre, grupoScoutId: result.data.grupoScoutId, categoria: result.data.categoria ?? null },
      org.userId,
    )
    return {
      patrulla: {
        id: updated.id,
        nombre: updated.nombre,
        grupoScoutId: updated.grupoScoutId,
        grupoScout: updated.grupoScout,
        categoria: updated.categoria,
      },
    }
  } catch (err) {
    if (err instanceof BusinessError) return patrullaError(err.code)
    throw err
  }
}

export type DeletePatrullaState = { error?: string }

export async function deletePatrullaAction(
  _prev: DeletePatrullaState,
  formData: FormData,
): Promise<DeletePatrullaState> {
  const org = await requireRole(["ADMIN"])
  const patrullaId = formData.get("patrullaId") as string

  try {
    await deletePatrulla(org.organizationId, patrullaId, org.userId)
    return {}
  } catch (err) {
    if (err instanceof BusinessError) return { error: patrullaError(err.code).error }
    throw err
  }
}
