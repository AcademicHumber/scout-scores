import { prisma } from "@/lib/db"

export class BusinessError extends Error {
  constructor(public code: string) {
    super(code)
    this.name = "BusinessError"
  }
}

/**
 * Tira BusinessError("LAST_ADMIN") si remover/degradar `membershipId`
 * dejaría al distrito sin ningún ADMIN.
 */
export async function assertNotLastAdmin(
  organizationId: string,
  membershipId: string,
  newRole?: string,
) {
  if (newRole === "ADMIN") return

  const adminCount = await prisma.membership.count({
    where: { organizationId, role: "ADMIN", id: { not: membershipId } },
  })
  if (adminCount === 0) {
    throw new BusinessError("LAST_ADMIN")
  }
}
