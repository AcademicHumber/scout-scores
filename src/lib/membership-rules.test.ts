import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    membership: {
      count: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/db"
import { assertNotLastAdmin, BusinessError } from "@/lib/membership-rules"

const mockCount = vi.mocked(prisma.membership.count)

beforeEach(() => vi.clearAllMocks())

describe("assertNotLastAdmin", () => {
  it("throws LAST_ADMIN when no other admins exist", async () => {
    mockCount.mockResolvedValue(0)
    await expect(assertNotLastAdmin("org-1", "mem-1", "JUEZ")).rejects.toThrow(BusinessError)
    await expect(assertNotLastAdmin("org-1", "mem-1", "JUEZ")).rejects.toThrow("LAST_ADMIN")
  })

  it("passes when another admin exists", async () => {
    mockCount.mockResolvedValue(1)
    await expect(assertNotLastAdmin("org-1", "mem-1", "JUEZ")).resolves.toBeUndefined()
  })

  it("passes without checking when new role is still ADMIN", async () => {
    await expect(assertNotLastAdmin("org-1", "mem-1", "ADMIN")).resolves.toBeUndefined()
    expect(mockCount).not.toHaveBeenCalled()
  })

  it("throws LAST_ADMIN on removal (no role) when only admin", async () => {
    mockCount.mockResolvedValue(0)
    await expect(assertNotLastAdmin("org-1", "mem-1")).rejects.toThrow(BusinessError)
  })

  it("passes on removal when another admin exists", async () => {
    mockCount.mockResolvedValue(2)
    await expect(assertNotLastAdmin("org-1", "mem-1")).resolves.toBeUndefined()
  })
})
