"use server"
import { z } from "zod"
import { requireRole, requireUser } from "@/lib/auth-helpers"
import { forOrg, prisma } from "@/lib/db"
import { unstable_update } from "@/auth"
import { assertNotLastAdmin, BusinessError } from "@/lib/membership-rules"
import { revalidatePath } from "next/cache"

const updateSchema = z.object({
  membershipId: z.string().min(1),
  role: z.enum(["ADMIN", "JUEZ", "ESPECTADOR", "JEFE_PATRULLA"]),
  grupoScoutId: z
    .string()
    .min(1)
    .optional()
    .or(z.literal("").transform(() => undefined)),
})

export async function updateMembership(_prev: unknown, formData: FormData) {
  const [org, user] = await Promise.all([requireRole(["ADMIN"]), requireUser()])
  const parsed = updateSchema.safeParse({
    membershipId: formData.get("membershipId"),
    role: formData.get("role"),
    grupoScoutId: formData.get("grupoScoutId") || undefined,
  })
  if (!parsed.success) return { error: "Datos inválidos" }

  const repo = forOrg(org.organizationId)
  const target = await repo.membership.findFirst({ where: { id: parsed.data.membershipId } })
  if (!target) return { error: "Miembro no encontrado" }

  if (parsed.data.grupoScoutId) {
    const grupo = await repo.grupoScout.findFirst({ where: { id: parsed.data.grupoScoutId } })
    if (!grupo) return { error: "Grupo inválido" }
  }

  try {
    await assertNotLastAdmin(org.organizationId, target.id, parsed.data.role)
  } catch (e) {
    if (e instanceof BusinessError && e.code === "LAST_ADMIN") {
      return { error: "No podés quitar el último ADMIN del distrito" }
    }
    throw e
  }

  await prisma.$transaction(async (tx) => {
    await tx.membership.update({
      where: { id: target.id },
      data: { role: parsed.data.role, grupoScoutId: parsed.data.grupoScoutId ?? null },
    })
    await tx.auditLog.create({
      data: {
        organizationId: org.organizationId,
        actorUserId: user.id,
        action: "membership.updated",
        targetType: "Membership",
        targetId: target.id,
        metadata: {
          fromRole: target.role,
          toRole: parsed.data.role,
          fromGrupo: target.grupoScoutId,
          toGrupo: parsed.data.grupoScoutId ?? null,
        },
      },
    })
  })

  if (target.userId === user.id) {
    await unstable_update({ refreshMemberships: true })
  }
  revalidatePath("/admin/miembros")
  return { success: true }
}

export async function removeMembership(_prev: unknown, formData: FormData) {
  const [org, user] = await Promise.all([requireRole(["ADMIN"]), requireUser()])
  const id = z.string().min(1).parse(formData.get("id"))

  const repo = forOrg(org.organizationId)
  const target = await repo.membership.findFirst({ where: { id } })
  if (!target) return { error: "Miembro no encontrado" }

  try {
    await assertNotLastAdmin(org.organizationId, target.id)
  } catch (e) {
    if (e instanceof BusinessError) return { error: "No podés expulsar al último ADMIN del distrito" }
    throw e
  }

  await prisma.$transaction(async (tx) => {
    await tx.membership.delete({ where: { id: target.id } })
    await tx.auditLog.create({
      data: {
        organizationId: org.organizationId,
        actorUserId: user.id,
        action: "membership.removed",
        targetType: "Membership",
        targetId: target.id,
        metadata: { removedUserId: target.userId, role: target.role },
      },
    })
  })

  if (target.userId === user.id) {
    await unstable_update({ refreshMemberships: true })
  }
  revalidatePath("/admin/miembros")
  return { success: true }
}
