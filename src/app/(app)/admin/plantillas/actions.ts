"use server"
import { z } from "zod"
import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth-helpers"
import { BusinessError } from "@/lib/errors"
import {
  createScoreTemplate as dbCreate,
  archiveScoreTemplate as dbArchive,
  unarchiveScoreTemplate as dbUnarchive,
  duplicateScoreTemplate as dbDuplicate,
  deleteScoreTemplate as dbDelete,
} from "@/repositories/score-template.repo"
import { Decimal } from "@prisma/client/runtime/client"
import type { ScoreTemplateModo, ScoreTemplateCategoria, TemplateCriterionTipo } from "@/generated/prisma/enums"

// ─── Zod helpers ─────────────────────────────────────────────────────────────

const decimalArraySchema = z
  .array(z.string().regex(/^\d+(\.\d+)?$/, "Valor inválido"))
  .transform((vals) => vals.map((v) => new Decimal(v)))

const escalaSchema = decimalArraySchema.refine(
  (vals) => vals.length >= 2 && vals.length <= 20,
  { message: "La escala debe tener entre 2 y 20 valores" },
)

const criterioSchema = z.object({
  nombre: z.string().min(2).max(100),
  descripcion: z.string().max(500).optional(),
  tipo: z.enum(["PUNTUABLE", "DESEMPATE"]),
})

const createTemplateSchema = z
  .object({
    nombre: z.string().min(2).max(100),
    descripcion: z.string().max(500).optional(),
    modo: z.enum(["CRITERIOS", "PUNTAJE_UNICO"]),
    categoria: z.enum(["COMPETICION", "CONSTRUCCION", "COCINA", "OTRO"]),
    valoresValidos: escalaSchema,
    valoresValidosDesempate: decimalArraySchema.refine(
      (vals) => vals.length === 0 || vals.length >= 2,
      { message: "La escala de desempate debe tener al menos 2 valores si se activa" },
    ),
    criterios: z.array(criterioSchema).optional(),
  })
  .refine(
    (data) => {
      if (data.modo === "PUNTAJE_UNICO" && data.criterios) {
        return data.criterios.every((c) => c.tipo === "DESEMPATE")
      }
      return true
    },
    { message: "Las plantillas con puntaje único solo aceptan criterios de desempate" },
  )

// ─── Actions ─────────────────────────────────────────────────────────────────

export async function createTemplate(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])

  // Parsear valores desde FormData (arrays vienen como múltiples entries)
  const valoresValidos = formData.getAll("valoresValidos") as string[]
  const valoresValidosDesempate = formData.getAll("valoresValidosDesempate") as string[]
  const criteriosRaw: { nombre: string; descripcion?: string; tipo: string }[] = []

  // Criterios vienen como criterios[0][nombre], criterios[0][tipo], etc.
  let i = 0
  while (formData.has(`criterios[${i}][nombre]`)) {
    criteriosRaw.push({
      nombre: formData.get(`criterios[${i}][nombre]`) as string,
      descripcion: (formData.get(`criterios[${i}][descripcion]`) as string) || undefined,
      tipo: formData.get(`criterios[${i}][tipo]`) as string,
    })
    i++
  }

  const parsed = createTemplateSchema.safeParse({
    nombre: formData.get("nombre"),
    descripcion: (formData.get("descripcion") as string) || undefined,
    modo: formData.get("modo"),
    categoria: formData.get("categoria"),
    valoresValidos,
    valoresValidosDesempate,
    criterios: criteriosRaw.length > 0 ? criteriosRaw : undefined,
  })

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  let newId: string
  try {
    const result = await dbCreate(
      org.organizationId,
      {
        nombre: parsed.data.nombre,
        descripcion: parsed.data.descripcion,
        modo: parsed.data.modo as ScoreTemplateModo,
        categoria: parsed.data.categoria as ScoreTemplateCategoria,
        valoresValidos: parsed.data.valoresValidos,
        valoresValidosDesempate: parsed.data.valoresValidosDesempate,
        criterios: parsed.data.criterios?.map((c) => ({
          nombre: c.nombre,
          descripcion: c.descripcion,
          tipo: c.tipo as TemplateCriterionTipo,
        })),
      },
      org.userId,
    )
    newId = result.id
  } catch (e) {
    if (e instanceof BusinessError) {
      if (e.code === "NOMBRE_DUPLICADO") return { error: "Ya existe una plantilla con ese nombre" }
      if (e.code === "ESCALA_INVALIDA") return { error: "La escala debe tener al menos 2 valores ordenados ascendentemente sin repetir" }
      if (e.code === "MODO_INCOMPATIBLE") return { error: "Las plantillas con puntaje único solo aceptan criterios de desempate" }
    }
    throw e
  }

  redirect(`/admin/plantillas/${newId}`)
}

export async function archiveTemplate(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const id = z.string().min(1).parse(formData.get("id"))

  try {
    await dbArchive(org.organizationId, id, org.userId)
  } catch (e) {
    if (e instanceof BusinessError && e.code === "NOT_FOUND") return { error: "Plantilla no encontrada" }
    throw e
  }
  return { success: true }
}

export async function unarchiveTemplate(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const id = z.string().min(1).parse(formData.get("id"))

  try {
    await dbUnarchive(org.organizationId, id, org.userId)
  } catch (e) {
    if (e instanceof BusinessError && e.code === "NOT_FOUND") return { error: "Plantilla no encontrada" }
    throw e
  }
  return { success: true }
}

export async function duplicateTemplate(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const id = z.string().min(1).parse(formData.get("id"))

  let newId: string
  try {
    const result = await dbDuplicate(org.organizationId, id, org.userId)
    newId = result.id
  } catch (e) {
    if (e instanceof BusinessError && e.code === "NOT_FOUND") return { error: "Plantilla no encontrada" }
    throw e
  }

  redirect(`/admin/plantillas/${newId}`)
}

export async function deleteTemplate(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const id = z.string().min(1).parse(formData.get("id"))

  try {
    await dbDelete(org.organizationId, id, org.userId)
  } catch (e) {
    if (e instanceof BusinessError) {
      if (e.code === "NOT_FOUND") return { error: "Plantilla no encontrada" }
      if (e.code === "IN_USE") return { error: "No se puede eliminar: la plantilla está en uso en un evento" }
    }
    throw e
  }

  redirect("/admin/plantillas")
}

// Wrappers sin _prev para uso en forms de Server Components (no useActionState)
export async function archiveTemplateSimple(formData: FormData) {
  await archiveTemplate(null, formData)
}

export async function unarchiveTemplateSimple(formData: FormData) {
  await unarchiveTemplate(null, formData)
}

export async function duplicateTemplateSimple(formData: FormData) {
  await duplicateTemplate(null, formData)
}

export async function deleteTemplateSimple(formData: FormData) {
  await deleteTemplate(null, formData)
}
