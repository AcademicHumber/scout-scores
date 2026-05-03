"use server"

import { z } from "zod"
import { requireRole } from "@/lib/auth-helpers"
import { createEvento, deleteEvento } from "@/repositories/evento.repo"
import { BusinessError } from "@/lib/errors"
import { redirect } from "next/navigation"

const CreateEventoSchema = z
  .object({
    nombre: z.string().trim().min(2, "Mínimo 2 caracteres").max(100),
    descripcion: z.string().trim().max(1000).optional(),
    lugar: z.string().trim().max(200).optional(),
    fechaInicio: z.string().min(1, "La fecha de inicio es obligatoria"),
    fechaFin: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.fechaFin && data.fechaFin !== "") {
        return new Date(data.fechaFin) >= new Date(data.fechaInicio)
      }
      return true
    },
    { message: "La fecha de fin debe ser igual o posterior a la fecha de inicio", path: ["fechaFin"] },
  )

export type CreateEventoState = { error?: string; fieldErrors?: Record<string, string[]> }

export async function createEventoAction(
  _prev: CreateEventoState,
  formData: FormData,
): Promise<CreateEventoState> {
  const org = await requireRole(["ADMIN"])

  const raw = {
    nombre: formData.get("nombre") as string,
    descripcion: formData.get("descripcion") as string || undefined,
    lugar: formData.get("lugar") as string || undefined,
    fechaInicio: formData.get("fechaInicio") as string,
    fechaFin: formData.get("fechaFin") as string || undefined,
  }

  const result = CreateEventoSchema.safeParse(raw)
  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { nombre, descripcion, lugar, fechaInicio, fechaFin } = result.data

  try {
    const { id } = await createEvento(
      org.organizationId,
      {
        nombre,
        descripcion: descripcion || undefined,
        lugar: lugar || undefined,
        fechaInicio: new Date(fechaInicio),
        fechaFin: fechaFin && fechaFin !== "" ? new Date(fechaFin) : undefined,
      },
      org.userId,
    )
    redirect(`/admin/eventos/${id}`)
  } catch (err) {
    if (err instanceof BusinessError) {
      if (err.code === "FECHA_INVALIDA") return { error: "La fecha de fin debe ser igual o posterior a la fecha de inicio" }
      if (err.code === "NOMBRE_DUPLICADO") return { error: "Ya existe un evento con ese nombre" }
    }
    throw err
  }
}

export type DeleteEventoState = { error?: string }

export async function deleteEventoAction(
  _prev: DeleteEventoState,
  formData: FormData,
): Promise<DeleteEventoState> {
  const org = await requireRole(["ADMIN"])
  const id = formData.get("id") as string

  try {
    await deleteEvento(org.organizationId, id, org.userId)
  } catch (err) {
    if (err instanceof BusinessError) {
      if (err.code === "NO_DELETABLE") return { error: "Solo se pueden eliminar eventos en estado Borrador" }
      if (err.code === "NOT_FOUND") return { error: "Evento no encontrado" }
    }
    throw err
  }

  redirect("/admin/eventos")
}
