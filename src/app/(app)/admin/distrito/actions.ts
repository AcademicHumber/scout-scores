"use server"
import { z } from "zod"
import { requireRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/db"
import { unstable_update } from "@/auth"
import { revalidatePath } from "next/cache"

const schema = z.object({ nombre: z.string().min(2).max(100) })

export async function updateDistrito(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const parsed = schema.safeParse({ nombre: formData.get("nombre") })
  if (!parsed.success) return { error: "Nombre inválido (mínimo 2, máximo 100 caracteres)" }

  await prisma.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: org.organizationId },
      data: { nombre: parsed.data.nombre },
    })
    await tx.auditLog.create({
      data: {
        organizationId: org.organizationId,
        actorUserId: org.userId,
        action: "organization.updated",
        targetType: "Organization",
        targetId: org.organizationId,
        metadata: { nombre: parsed.data.nombre },
      },
    })
  })

  await unstable_update({ refreshMemberships: true })
  revalidatePath("/admin/distrito")
  return { success: true }
}
