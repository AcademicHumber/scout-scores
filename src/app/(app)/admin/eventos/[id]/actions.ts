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
import { BusinessError } from "@/lib/errors"
import { Decimal } from "@prisma/client/runtime/client"
import type { EventoEstado, ActividadTipo } from "@/generated/prisma/enums"

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

export type TransicionarEstadoState = {
  error?: string
  pesosError?: { sumaActual: number; faltante: number; sinActividades?: boolean }
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
