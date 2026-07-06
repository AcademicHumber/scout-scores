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
  asignarPosta,
  updateAsignacion,
  desasignarPosta,
  reorderAsignacion,
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

type CierreIncompletoFaltante = {
  postaNombre: string
  actividadNombre: string
  patrullaNombre: string
  estado: "SIN_CARGAR" | "BORRADOR"
}

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
    } else if (e.code === "ACTIVIDAD_SIN_PLANTILLA") {
      const meta = e.meta as { actividades: Array<{ nombre: string }> }
      const nombres = meta.actividades.map((a) => `"${a.nombre}"`).join(", ")
      const count = meta.actividades.length
      lines.push(count === 1
        ? `• 1 actividad sin plantilla: ${nombres}`
        : `• ${count} actividades sin plantilla: ${nombres}`)
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
      if (err.code === "CIERRE_INCOMPLETO") {
        const meta = err.meta as { faltantes: CierreIncompletoFaltante[] }
        return { error: buildCierreIncompletoMessage(meta.faltantes) }
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

function buildCierreIncompletoMessage(faltantes: CierreIncompletoFaltante[]): string {
  const lines: string[] = ["No se puede cerrar el evento. Faltan planillas:"]
  const grupos = new Map<string, CierreIncompletoFaltante[]>()
  for (const f of faltantes) {
    const key = `${f.postaNombre}|${f.actividadNombre}`
    if (!grupos.has(key)) grupos.set(key, [])
    grupos.get(key)!.push(f)
  }
  for (const [key, items] of grupos) {
    const [postaNombre, actividadNombre] = key.split("|")
    lines.push(`• ${postaNombre} (${actividadNombre})`)
    for (const i of items) {
      const estadoLabel = i.estado === "SIN_CARGAR" ? "sin cargar" : "borrador"
      lines.push(`    - ${i.patrullaNombre} — ${estadoLabel}`)
    }
  }
  return lines.join("\n")
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
  templateId: z.string().optional().nullable(),
})

export type ActividadState = { error?: string; fieldErrors?: Record<string, string[]>; actividad?: { id: string; nombre: string; descripcion: string | null; tipo: ActividadTipo; pesoRelativo: string; orden: number; templateId: string | null } }

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
    templateId: (formData.get("templateId") as string) || null,
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
        templateId: result.data.templateId,
      },
      org.userId,
    )
    return {}
  } catch (err) {
    if (err instanceof BusinessError) {
      if (err.code === "EVENTO_LOCKED") return { error: "El evento ya tiene puntajes cargados; no se pueden modificar las actividades" }
      if (err.code === "NOT_FOUND") return { error: "Evento no encontrado" }
      if (err.code === "PLANTILLA_INVALIDA") return { error: "La plantilla seleccionada no es válida o está archivada" }
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
    templateId: (formData.get("templateId") as string) || null,
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
        templateId: result.data.templateId,
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
        templateId: updated.templateId,
      },
    }
  } catch (err) {
    if (err instanceof BusinessError) {
      if (err.code === "EVENTO_LOCKED") return { error: "El evento ya tiene puntajes cargados; no se pueden modificar las actividades" }
      if (err.code === "ACTIVIDAD_NO_ENCONTRADA") return { error: "Actividad no encontrada" }
      if (err.code === "NOT_FOUND") return { error: "Evento no encontrado" }
      if (err.code === "PLANTILLA_INVALIDA") return { error: "La plantilla seleccionada no es válida o está archivada" }
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

// ─── AsignacionPosta ──────────────────────────────────────────────────────────

const AsignacionSchema = z.object({
  postaId: z.string().min(1),
  juezUserId: z.string().optional(),
  encargado: z.string().trim().max(100).optional(),
  ayudantes: z.string().trim().max(300).optional(),
  weight: z.coerce.number().min(0.01).max(999.99).default(1),
})

const UpdateAsignacionSchema = z.object({
  juezUserId: z.string().optional(),
  encargado: z.string().trim().max(100).optional(),
  ayudantes: z.string().trim().max(300).optional(),
  weight: z.coerce.number().min(0.01).max(999.99).default(1),
})

export type AsignacionState = {
  success?: true
  error?: string
  fieldErrors?: Record<string, string[]>
  asignacion?: {
    id: string
    postaId: string
    juezUserId: string | null
    encargado: string | null
    ayudantes: string | null
    weight: string
    juezUser: { id: string; name: string | null; email: string } | null
  }
}

function asignacionError(code: string): AsignacionState {
  const map: Record<string, string> = {
    POSTA_NO_ENCONTRADA: "Posta no encontrada",
    ASIGNACION_NO_ENCONTRADA: "Asignación no encontrada",
    ACTIVIDAD_NO_ENCONTRADA: "Actividad no encontrada",
    POSTA_YA_ASIGNADA_EN_EVENTO: "Esta posta ya está asignada a otra actividad de este evento",
    EVENTO_LOCKED: "El evento ya tiene puntajes cargados",
    JUEZ_INVALIDO: "El usuario seleccionado no tiene rol de juez en este distrito",
  }
  return { error: map[code] ?? "Error inesperado" }
}

export async function asignarPostaAction(
  _prev: AsignacionState,
  formData: FormData,
): Promise<AsignacionState> {
  const org = await requireRole(["ADMIN"])
  const actividadId = formData.get("actividadId") as string

  const raw = {
    postaId: formData.get("postaId") as string,
    juezUserId: (formData.get("juezUserId") as string) || undefined,
    encargado: (formData.get("encargado") as string) || undefined,
    ayudantes: (formData.get("ayudantes") as string) || undefined,
    weight: formData.get("weight") as string,
  }

  const result = AsignacionSchema.safeParse(raw)
  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    await asignarPosta(
      org.organizationId,
      actividadId,
      {
        postaId: result.data.postaId,
        juezUserId: result.data.juezUserId || null,
        encargado: result.data.encargado || null,
        ayudantes: result.data.ayudantes || null,
        weight: new Decimal(result.data.weight),
      },
      org.userId,
    )
    return { success: true }
  } catch (err) {
    if (err instanceof BusinessError) return asignacionError(err.code)
    throw err
  }
}

export async function updateAsignacionAction(
  _prev: AsignacionState,
  formData: FormData,
): Promise<AsignacionState> {
  const org = await requireRole(["ADMIN"])
  const asignacionId = formData.get("asignacionId") as string

  const raw = {
    juezUserId: (formData.get("juezUserId") as string) || undefined,
    encargado: (formData.get("encargado") as string) || undefined,
    ayudantes: (formData.get("ayudantes") as string) || undefined,
    weight: formData.get("weight") as string,
  }

  const result = UpdateAsignacionSchema.safeParse(raw)
  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    const updated = await updateAsignacion(
      org.organizationId,
      asignacionId,
      {
        juezUserId: result.data.juezUserId || null,
        encargado: result.data.encargado || null,
        ayudantes: result.data.ayudantes || null,
        weight: new Decimal(result.data.weight),
      },
      org.userId,
    )
    return {
      asignacion: {
        id: updated.id,
        postaId: updated.postaId,
        juezUserId: updated.juezUserId,
        encargado: updated.encargado,
        ayudantes: updated.ayudantes,
        weight: updated.weight.toString(),
        juezUser: updated.juezUser,
      },
    }
  } catch (err) {
    if (err instanceof BusinessError) return asignacionError(err.code)
    throw err
  }
}

export type DesasignarState = { error?: string }

export async function desasignarPostaAction(
  _prev: DesasignarState,
  formData: FormData,
): Promise<DesasignarState> {
  const org = await requireRole(["ADMIN"])
  const asignacionId = formData.get("asignacionId") as string

  try {
    await desasignarPosta(org.organizationId, asignacionId, org.userId)
    return {}
  } catch (err) {
    if (err instanceof BusinessError) return { error: asignacionError(err.code).error }
    throw err
  }
}

export type ReorderAsignacionState = { error?: string }

export async function reorderAsignacionAction(
  _prev: ReorderAsignacionState,
  formData: FormData,
): Promise<ReorderAsignacionState> {
  const org = await requireRole(["ADMIN"])
  const asignacionId = formData.get("asignacionId") as string
  const direction = formData.get("direction") as "up" | "down"

  try {
    await reorderAsignacion(org.organizationId, asignacionId, direction, org.userId)
    return {}
  } catch (err) {
    if (err instanceof BusinessError) return { error: asignacionError(err.code).error }
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
