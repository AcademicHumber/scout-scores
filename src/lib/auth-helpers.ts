import { cache } from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import type { Role } from "@/generated/prisma/enums"

export const getCurrentUser = cache(async () => {
  const session = await auth()
  return session?.user ?? null
})

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
}

export async function getCurrentOrg() {
  const user = await getCurrentUser()
  if (!user || !user.activeOrganizationId) return null
  return {
    organizationId: user.activeOrganizationId,
    role: user.activeRole!,
    grupoScoutId: user.activeGrupoScoutId,
    nombre: user.activeOrganizationNombre!,
  }
}

export async function requireOrg() {
  const org = await getCurrentOrg()
  if (!org) redirect("/onboarding")
  return org
}

export async function requireRole(roles: Role[]) {
  const [user, org] = await Promise.all([requireUser(), requireOrg()])
  if (!roles.includes(org.role)) {
    throw new Error("FORBIDDEN")
  }
  return { ...org, userId: user.id }
}
