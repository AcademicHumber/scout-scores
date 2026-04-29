import { forOrg } from "@/lib/db"

/**
 * Marca como EXPIRED las invitaciones PENDING vencidas. Idempotente.
 * Llamar antes de cualquier listado o al evaluar un token recibido.
 */
export async function markInvitationsExpired(organizationId: string) {
  const repo = forOrg(organizationId)
  await repo.invitation.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  })
}
