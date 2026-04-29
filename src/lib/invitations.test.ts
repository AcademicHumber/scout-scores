import { describe, it, expect, vi, beforeEach } from "vitest"

const mockUpdateMany = vi.fn()

vi.mock("@/lib/db", () => ({
  forOrg: vi.fn(() => ({
    invitation: { updateMany: mockUpdateMany },
  })),
}))

import { markInvitationsExpired } from "@/lib/invitations"

beforeEach(() => vi.clearAllMocks())

describe("markInvitationsExpired", () => {
  it("calls updateMany with PENDING status and past expiresAt", async () => {
    mockUpdateMany.mockResolvedValue({ count: 2 })
    const before = new Date()
    await markInvitationsExpired("org-1")
    const after = new Date()

    expect(mockUpdateMany).toHaveBeenCalledOnce()
    const call = mockUpdateMany.mock.calls[0][0]
    expect(call.where.status).toBe("PENDING")
    expect(call.where.expiresAt.lt).toBeInstanceOf(Date)
    expect(call.where.expiresAt.lt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(call.where.expiresAt.lt.getTime()).toBeLessThanOrEqual(after.getTime())
    expect(call.data.status).toBe("EXPIRED")
  })

  it("does not touch ACCEPTED or REVOKED invitations", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 })
    await markInvitationsExpired("org-2")
    const call = mockUpdateMany.mock.calls[0][0]
    expect(call.where.status).toBe("PENDING")
  })
})
