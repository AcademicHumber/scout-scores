import { cache } from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { NextResponse } from "next/server"
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

// Para API routes: no hace redirect ni throw, devuelve un objeto discriminado.
export async function requireRoleApi(
  roles: Role[],
): Promise<
  | { ok: false; response: NextResponse }
  | { ok: true; userId: string; organizationId: string; role: Role; grupoScoutId: string | null | undefined }
> {
  const session = await auth()
  const user = session?.user

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status: 401 }),
    }
  }

  const organizationId = user.activeOrganizationId
  const role = user.activeRole as Role | null

  if (!organizationId || !role) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, code: "NO_ORGANIZATION" }, { status: 403 }),
    }
  }

  if (!roles.includes(role)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, code: "FORBIDDEN" }, { status: 403 }),
    }
  }

  return {
    ok: true,
    userId: user.id,
    organizationId,
    role,
    grupoScoutId: user.activeGrupoScoutId,
  }
}
