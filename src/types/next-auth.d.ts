import type { Role } from "@/generated/prisma/enums"
import "next-auth"
import "next-auth/jwt"

interface MembershipSummary {
  organizationId: string
  organizationNombre: string
  organizationSlug: string
  role: Role
  grupoScoutId: string | null
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      memberships: MembershipSummary[]
      activeOrganizationId: string | null
      activeRole: Role | null
      activeGrupoScoutId: string | null
      activeOrganizationNombre: string | null
    }
    /** Señal interna para forzar re-query de memberships en el callback jwt */
    refreshMemberships?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    memberships: MembershipSummary[]
    activeOrganizationId: string | null
  }
}
