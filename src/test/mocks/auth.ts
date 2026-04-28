import type { Role } from "@/generated/prisma/enums"

interface MembershipSummary {
  organizationId: string
  organizationNombre: string
  organizationSlug: string
  role: Role
  grupoScoutId: string | null
}

interface MockSessionOptions {
  userId?: string
  email?: string
  name?: string
  memberships?: MembershipSummary[]
  activeOrganizationId?: string | null
}

export function mockSession(opts: MockSessionOptions = {}) {
  const memberships = opts.memberships ?? []
  const activeOrganizationId = opts.activeOrganizationId !== undefined
    ? opts.activeOrganizationId
    : memberships[0]?.organizationId ?? null

  const active = memberships.find(m => m.organizationId === activeOrganizationId)

  return {
    user: {
      id: opts.userId ?? "test-user-id",
      email: opts.email ?? "test@example.com",
      name: opts.name ?? "Test User",
      image: null,
      memberships,
      activeOrganizationId,
      activeRole: active?.role ?? null,
      activeGrupoScoutId: active?.grupoScoutId ?? null,
      activeOrganizationNombre: active?.organizationNombre ?? null,
    },
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }
}

export function mockMembership(overrides: Partial<MembershipSummary> = {}): MembershipSummary {
  return {
    organizationId: "org-test-id",
    organizationNombre: "Distrito Test",
    organizationSlug: "distrito-test",
    role: "ADMIN",
    grupoScoutId: null,
    ...overrides,
  }
}
