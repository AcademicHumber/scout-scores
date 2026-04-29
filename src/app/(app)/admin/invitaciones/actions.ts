"use server"
import { z } from "zod"
import { requireRole } from "@/lib/auth-helpers"
import { forOrg, prisma } from "@/lib/db"
import { markInvitationsExpired } from "@/lib/invitations"
import { createId } from "@paralleldrive/cuid2"
import { revalidatePath } from "next/cache"

const INVITATION_TTL_DAYS = 7

const createSchema = z.object({
  email: z.string().email("Email inválido").toLowerCase(),
  role: z.enum(["ADMIN", "JUEZ", "ESPECTADOR", "JEFE_PATRULLA"]),
  grupoScoutId: z
    .string()
    .min(1)
    .optional()
    .or(z.literal("").transform(() => undefined)),
})

export async function createInvitation(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const parsed = createSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
    grupoScoutId: formData.get("grupoScoutId") || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  const repo = forOrg(org.organizationId)

  if (parsed.data.grupoScoutId) {
    const grupo = await repo.grupoScout.findFirst({ where: { id: parsed.data.grupoScoutId } })
    if (!grupo) return { error: "Grupo inválido" }
  }

  const yaMiembro = await prisma.membership.findFirst({
    where: { organizationId: org.organizationId, user: { email: parsed.data.email } },
  })
  if (yaMiembro) return { error: "Ese email ya es miembro del distrito" }

  await markInvitationsExpired(org.organizationId)

  const yaInvitada = await repo.invitation.findFirst({
    where: { email: parsed.data.email, status: "PENDING" },
  })
  if (yaInvitada) return { error: "Ya hay una invitación pendiente para ese email. Revocala primero." }

  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 3600 * 1000)
  const token = createId()

  const invitation = await prisma.$transaction(async (tx) => {
    const inv = await tx.invitation.create({
      data: {
        organizationId: org.organizationId,
        email: parsed.data.email,
        role: parsed.data.role,
        grupoScoutId: parsed.data.grupoScoutId ?? null,
        token,
        expiresAt,
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId: org.organizationId,
        actorUserId: org.userId,
        action: "invitation.created",
        targetType: "Invitation",
        targetId: inv.id,
        metadata: { email: inv.email, role: inv.role },
      },
    })
    return inv
  })

  revalidatePath("/admin/invitaciones")
  return { success: true, token: invitation.token }
}

export async function revokeInvitation(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const id = z.string().min(1).parse(formData.get("id"))

  const repo = forOrg(org.organizationId)
  const inv = await repo.invitation.findFirst({ where: { id, status: "PENDING" } })
  if (!inv) return { error: "Invitación no encontrada o ya procesada" }

  await prisma.$transaction(async (tx) => {
    await tx.invitation.update({
      where: { id },
      data: { status: "REVOKED", revokedAt: new Date() },
    })
    await tx.auditLog.create({
      data: {
        organizationId: org.organizationId,
        actorUserId: org.userId,
        action: "invitation.revoked",
        targetType: "Invitation",
        targetId: id,
        metadata: { email: inv.email },
      },
    })
  })

  revalidatePath("/admin/invitaciones")
  return { success: true }
}
