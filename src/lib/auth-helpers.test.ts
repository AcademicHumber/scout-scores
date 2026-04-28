import { describe, it, expect, vi, beforeEach } from "vitest"
import { mockSession, mockMembership } from "@/test/mocks/auth"

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
}))

import { auth } from "@/auth"
import {
  getCurrentUser,
  requireUser,
  getCurrentOrg,
  requireOrg,
  requireRole,
} from "@/lib/auth-helpers"

type AuthReturn = Awaited<ReturnType<typeof auth>>
const mockAuth = vi.mocked(auth)
const asAuthReturn = (val: ReturnType<typeof mockSession> | null) =>
  val as unknown as AuthReturn

beforeEach(() => {
  vi.clearAllMocks()
})

describe("getCurrentUser", () => {
  it("returns null when not authenticated", async () => {
    mockAuth.mockResolvedValue(asAuthReturn(null))
    expect(await getCurrentUser()).toBeNull()
  })

  it("returns user when authenticated", async () => {
    const session = mockSession({ memberships: [mockMembership()] })
    mockAuth.mockResolvedValue(asAuthReturn(session))
    const user = await getCurrentUser()
    expect(user?.id).toBe("test-user-id")
  })
})

describe("requireUser", () => {
  it("redirects to /login when not authenticated", async () => {
    mockAuth.mockResolvedValue(asAuthReturn(null))
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login")
  })

  it("returns user when authenticated", async () => {
    const session = mockSession({ memberships: [mockMembership()] })
    mockAuth.mockResolvedValue(asAuthReturn(session))
    const user = await requireUser()
    expect(user.email).toBe("test@example.com")
  })
})

describe("getCurrentOrg", () => {
  it("returns null when no active org", async () => {
    const session = mockSession({ memberships: [], activeOrganizationId: null })
    mockAuth.mockResolvedValue(asAuthReturn(session))
    expect(await getCurrentOrg()).toBeNull()
  })

  it("returns org data when user has active org", async () => {
    const membership = mockMembership({ role: "JUEZ" })
    const session = mockSession({ memberships: [membership] })
    mockAuth.mockResolvedValue(asAuthReturn(session))
    const org = await getCurrentOrg()
    expect(org?.role).toBe("JUEZ")
    expect(org?.organizationId).toBe("org-test-id")
  })
})

describe("requireOrg", () => {
  it("redirects to /onboarding when no org", async () => {
    const session = mockSession({ memberships: [], activeOrganizationId: null })
    mockAuth.mockResolvedValue(asAuthReturn(session))
    await expect(requireOrg()).rejects.toThrow("REDIRECT:/onboarding")
  })
})

describe("requireRole", () => {
  it("throws FORBIDDEN when role is not in allowed list", async () => {
    const membership = mockMembership({ role: "JUEZ" })
    const session = mockSession({ memberships: [membership] })
    mockAuth.mockResolvedValue(asAuthReturn(session))
    await expect(requireRole(["ADMIN"])).rejects.toThrow("FORBIDDEN")
  })

  it("returns org when role is allowed", async () => {
    const membership = mockMembership({ role: "ADMIN" })
    const session = mockSession({ memberships: [membership] })
    mockAuth.mockResolvedValue(asAuthReturn(session))
    const org = await requireRole(["ADMIN"])
    expect(org.role).toBe("ADMIN")
  })

  it("allows multiple roles", async () => {
    const membership = mockMembership({ role: "JUEZ" })
    const session = mockSession({ memberships: [membership] })
    mockAuth.mockResolvedValue(asAuthReturn(session))
    const org = await requireRole(["ADMIN", "JUEZ"])
    expect(org.role).toBe("JUEZ")
  })
})
