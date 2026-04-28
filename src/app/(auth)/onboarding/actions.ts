"use server"

import { z } from "zod"
import { requireUser } from "@/lib/auth-helpers"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"

const createDistritoSchema = z.object({
  nombre: z.string().min(2).max(100),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .min(2)
    .max(50),
})

export async function createDistrito(formData: FormData) {
  const user = await requireUser()

  const parsed = createDistritoSchema.safeParse({
    nombre: formData.get("nombre"),
    slug: formData.get("slug"),
  })

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const { nombre, slug } = parsed.data

  await prisma.$transaction(async (tx) => {
    const existing = await tx.organization.findUnique({ where: { slug } })
    if (existing) throw new Error("SLUG_TAKEN")

    const org = await tx.organization.create({ data: { nombre, slug } })

    await tx.membership.create({
      data: { userId: user.id, organizationId: org.id, role: "ADMIN" },
    })

    await tx.auditLog.create({
      data: {
        organizationId: org.id,
        actorUserId: user.id,
        action: "organization.created",
        targetType: "Organization",
        targetId: org.id,
        metadata: { nombre, slug },
      },
    })
  })

  redirect("/dashboard")
}

const aceptarSchema = z.object({ token: z.string().min(1) })

export async function aceptarInvitacion(formData: FormData) {
  const user = await requireUser()

  const parsed = aceptarSchema.safeParse({ token: formData.get("token") })
  if (!parsed.success) {
    throw new Error("Código requerido")
  }

  const { token } = parsed.data

  await prisma.$transaction(async (tx) => {
    const inv = await tx.invitation.findUnique({ where: { token } })

    if (!inv || inv.status !== "PENDING" || inv.expiresAt < new Date()) {
      throw new Error("INVITACION_INVALIDA")
    }

    if (inv.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new Error("EMAIL_NO_COINCIDE")
    }

    await tx.membership.create({
      data: {
        userId: user.id,
        organizationId: inv.organizationId,
        role: inv.role,
        grupoScoutId: inv.grupoScoutId,
      },
    })

    await tx.invitation.update({
      where: { id: inv.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    })

    await tx.auditLog.create({
      data: {
        organizationId: inv.organizationId,
        actorUserId: user.id,
        action: "invitation.accepted",
        targetType: "Invitation",
        targetId: inv.id,
        metadata: { role: inv.role },
      },
    })
  })

  redirect("/dashboard")
}
