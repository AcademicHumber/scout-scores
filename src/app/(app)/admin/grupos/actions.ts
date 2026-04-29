"use server"
import { z } from "zod"
import { requireRole } from "@/lib/auth-helpers"
import { forOrg, prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

const slugSchema = z.string().regex(/^[a-z0-9-]+$/, "Solo letras minúsculas, números y guiones").min(2).max(50)
const createSchema = z.object({
  nombre: z.string().min(2).max(100),
  slug: slugSchema,
})
const updateSchema = createSchema.extend({ id: z.string().min(1) })

export async function createGrupo(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const parsed = createSchema.safeParse({
    nombre: formData.get("nombre"),
    slug: formData.get("slug"),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  const repo = forOrg(org.organizationId)
  const existing = await repo.grupoScout.findFirst({ where: { slug: parsed.data.slug } })
  if (existing) return { error: "Ya existe un grupo con ese identificador" }

  await prisma.$transaction(async (tx) => {
    const grupo = await tx.grupoScout.create({
      data: { ...parsed.data, organizationId: org.organizationId },
    })
    await tx.auditLog.create({
      data: {
        organizationId: org.organizationId,
        actorUserId: org.userId,
        action: "grupo.created",
        targetType: "GrupoScout",
        targetId: grupo.id,
        metadata: { nombre: grupo.nombre, slug: grupo.slug },
      },
    })
  })

  revalidatePath("/admin/grupos")
  return { success: true }
}

export async function updateGrupo(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    nombre: formData.get("nombre"),
    slug: formData.get("slug"),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  const repo = forOrg(org.organizationId)

  const grupo = await repo.grupoScout.findFirst({ where: { id: parsed.data.id } })
  if (!grupo) return { error: "Grupo no encontrado" }

  if (grupo.slug !== parsed.data.slug) {
    const existing = await repo.grupoScout.findFirst({ where: { slug: parsed.data.slug } })
    if (existing) return { error: "Ya existe un grupo con ese identificador" }
  }

  await prisma.$transaction(async (tx) => {
    await tx.grupoScout.update({
      where: { id: parsed.data.id },
      data: { nombre: parsed.data.nombre, slug: parsed.data.slug },
    })
    await tx.auditLog.create({
      data: {
        organizationId: org.organizationId,
        actorUserId: org.userId,
        action: "grupo.updated",
        targetType: "GrupoScout",
        targetId: parsed.data.id,
        metadata: { nombre: parsed.data.nombre, slug: parsed.data.slug },
      },
    })
  })

  revalidatePath("/admin/grupos")
  return { success: true }
}

export async function deleteGrupo(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const id = z.string().min(1).parse(formData.get("id"))

  const repo = forOrg(org.organizationId)

  const grupo = await repo.grupoScout.findFirst({ where: { id } })
  if (!grupo) return { error: "Grupo no encontrado" }

  const [miembros, memberships, invs] = await Promise.all([
    repo.miembroScout.count({ where: { grupoScoutId: id } }),
    repo.membership.count({ where: { grupoScoutId: id } }),
    repo.invitation.count({ where: { grupoScoutId: id, status: "PENDING" } }),
  ])

  if (miembros > 0)
    return { error: `No se puede borrar: tiene ${miembros} miembro(s) scout vinculado(s)` }
  if (memberships > 0)
    return { error: `No se puede borrar: tiene ${memberships} usuario(s) asignado(s)` }
  if (invs > 0)
    return { error: `Hay ${invs} invitación(es) pendiente(s) a este grupo. Revocalas primero.` }

  await prisma.$transaction(async (tx) => {
    await tx.grupoScout.delete({ where: { id } })
    await tx.auditLog.create({
      data: {
        organizationId: org.organizationId,
        actorUserId: org.userId,
        action: "grupo.deleted",
        targetType: "GrupoScout",
        targetId: id,
        metadata: { nombre: grupo.nombre },
      },
    })
  })

  revalidatePath("/admin/grupos")
  return { success: true }
}
