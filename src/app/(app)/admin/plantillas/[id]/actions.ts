"use server"
import { z } from "zod"
import { requireRole } from "@/lib/auth-helpers"
import { BusinessError } from "@/lib/errors"
import {
  updateScoreTemplateMetadata,
  updateScoreTemplateCore,
  addCriterio as dbAddCriterio,
  updateCriterio as dbUpdateCriterio,
  deleteCriterio as dbDeleteCriterio,
  reorderCriterio as dbReorderCriterio,
} from "@/repositories/score-template.repo"
import { Decimal } from "@prisma/client/runtime/client"
import type { ScoreTemplateCategoria, ScoreTemplateModo, TemplateCriterionTipo } from "@/generated/prisma/enums"

const decimalArraySchema = z
  .array(z.string().regex(/^\d+(\.\d+)?$/))
  .transform((vals) => vals.map((v) => new Decimal(v)))

export async function updateMetadata(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const id = z.string().min(1).parse(formData.get("id"))
  const parsed = z
    .object({ nombre: z.string().min(2).max(100), descripcion: z.string().max(500).optional(), categoria: z.enum(["COMPETICION", "CONSTRUCCION", "COCINA", "OTRO"]) })
    .safeParse({ nombre: formData.get("nombre"), descripcion: (formData.get("descripcion") as string) || undefined, categoria: formData.get("categoria") })

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  try {
    await updateScoreTemplateMetadata(org.organizationId, id, parsed.data as { nombre: string; descripcion?: string; categoria: ScoreTemplateCategoria }, org.userId)
  } catch (e) {
    if (e instanceof BusinessError) {
      if (e.code === "NOMBRE_DUPLICADO") return { error: "Ya existe una plantilla con ese nombre" }
      if (e.code === "NOT_FOUND") return { error: "Plantilla no encontrada" }
    }
    throw e
  }

  return { success: true, nombre: parsed.data.nombre, descripcion: parsed.data.descripcion, categoria: parsed.data.categoria }
}

export async function updateCore(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const id = z.string().min(1).parse(formData.get("id"))

  const valoresValidos = formData.getAll("valoresValidos") as string[]
  const valoresValidosDesempate = formData.getAll("valoresValidosDesempate") as string[]
  const modo = formData.get("modo") as string

  const vvParsed = decimalArraySchema.safeParse(valoresValidos)
  if (!vvParsed.success) return { error: "La escala debe tener al menos 2 valores ordenados ascendentemente sin repetir" }
  const vvdParsed = decimalArraySchema.safeParse(valoresValidosDesempate.filter(Boolean))
  if (!vvdParsed.success) return { error: "La escala de desempate no es válida" }

  try {
    await updateScoreTemplateCore(
      org.organizationId,
      id,
      { modo: modo as ScoreTemplateModo, valoresValidos: vvParsed.data, valoresValidosDesempate: vvdParsed.data },
      org.userId,
    )
  } catch (e) {
    if (e instanceof BusinessError) {
      if (e.code === "IN_USE") return { error: "No se puede modificar: la plantilla está en uso en un evento" }
      if (e.code === "MODO_INCOMPATIBLE") {
        const bloqueantes = (e.meta?.criteriosBloqueantes as { nombre: string }[] | undefined)?.map((c) => c.nombre).join(", ")
        return { error: "MODO_INCOMPATIBLE", criteriosBloqueantes: bloqueantes ?? "" }
      }
      if (e.code === "ESCALA_INVALIDA") return { error: "La escala debe tener al menos 2 valores ordenados ascendentemente sin repetir" }
    }
    throw e
  }

  return { success: true, modo, valoresValidos: vvParsed.data.map(String), valoresValidosDesempate: vvdParsed.data.map(String) }
}

export async function addCriterio(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const templateId = z.string().min(1).parse(formData.get("templateId"))
  const parsed = z
    .object({ nombre: z.string().min(2).max(100), descripcion: z.string().max(500).optional(), tipo: z.enum(["PUNTUABLE", "DESEMPATE"]) })
    .safeParse({ nombre: formData.get("nombre"), descripcion: (formData.get("descripcion") as string) || undefined, tipo: formData.get("tipo") })

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  try {
    const result = await dbAddCriterio(org.organizationId, templateId, parsed.data as { nombre: string; descripcion?: string; tipo: TemplateCriterionTipo }, org.userId)
    return { success: true, id: result.id, ...parsed.data }
  } catch (e) {
    if (e instanceof BusinessError) {
      if (e.code === "MODO_INCOMPATIBLE") return { error: "Las plantillas con puntaje único solo aceptan criterios de desempate" }
      if (e.code === "NOT_FOUND") return { error: "Plantilla no encontrada" }
      if (e.code === "IN_USE") return { error: "No se puede modificar: la plantilla está en uso" }
    }
    throw e
  }
}

export async function updateCriterio(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const templateId = z.string().min(1).parse(formData.get("templateId"))
  const criterioId = z.string().min(1).parse(formData.get("criterioId"))
  const parsed = z
    .object({ nombre: z.string().min(2).max(100), descripcion: z.string().max(500).optional(), tipo: z.enum(["PUNTUABLE", "DESEMPATE"]) })
    .safeParse({ nombre: formData.get("nombre"), descripcion: (formData.get("descripcion") as string) || undefined, tipo: formData.get("tipo") })

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  try {
    const updated = await dbUpdateCriterio(org.organizationId, templateId, criterioId, parsed.data as { nombre: string; descripcion?: string; tipo: TemplateCriterionTipo }, org.userId)
    return { success: true, nombre: updated.nombre, descripcion: updated.descripcion, tipo: updated.tipo }
  } catch (e) {
    if (e instanceof BusinessError) {
      if (e.code === "MODO_INCOMPATIBLE") return { error: "Las plantillas con puntaje único solo aceptan criterios de desempate" }
      if (e.code === "CRITERIO_NO_ENCONTRADO") return { error: "Criterio no encontrado" }
      if (e.code === "IN_USE") return { error: "No se puede modificar: la plantilla está en uso" }
    }
    throw e
  }
}

export async function deleteCriterio(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const templateId = z.string().min(1).parse(formData.get("templateId"))
  const criterioId = z.string().min(1).parse(formData.get("criterioId"))

  try {
    await dbDeleteCriterio(org.organizationId, templateId, criterioId, org.userId)
  } catch (e) {
    if (e instanceof BusinessError) {
      if (e.code === "CRITERIO_NO_ENCONTRADO") return { error: "Criterio no encontrado" }
      if (e.code === "IN_USE") return { error: "No se puede modificar: la plantilla está en uso" }
    }
    throw e
  }
  return { success: true }
}

export async function reorderCriterio(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const templateId = z.string().min(1).parse(formData.get("templateId"))
  const criterioId = z.string().min(1).parse(formData.get("criterioId"))
  const direction = z.enum(["up", "down"]).parse(formData.get("direction"))

  try {
    await dbReorderCriterio(org.organizationId, templateId, criterioId, direction, org.userId)
  } catch (e) {
    if (e instanceof BusinessError && e.code === "IN_USE") return { error: "No se puede modificar: la plantilla está en uso" }
    throw e
  }
  return { success: true }
}
