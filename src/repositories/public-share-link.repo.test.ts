import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Mocks ────────────────────────────────────────────────────────────────────

const {
  mockLinkFindFirst,
  mockLinkFindUnique,
  mockLinkCreate,
  mockLinkUpdate,
  mockAuditLogCreate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockLinkFindFirst:  vi.fn(),
  mockLinkFindUnique: vi.fn(),
  mockLinkCreate:     vi.fn(),
  mockLinkUpdate:     vi.fn(),
  mockAuditLogCreate: vi.fn(),
  mockTransaction:    vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  prisma: {
    publicShareLink: {
      findFirst:  mockLinkFindFirst,
      findUnique: mockLinkFindUnique,
      create:     mockLinkCreate,
      update:     mockLinkUpdate,
    },
    auditLog: { create: mockAuditLogCreate },
    $transaction: mockTransaction,
  },
}))

vi.mock("next/cache", () => ({
  unstable_cache: (_fn: () => unknown) => _fn,
  revalidateTag: vi.fn(),
}))

import {
  createOrRotatePublicShareLink,
  revokePublicShareLink,
  findActivePublicShareLink,
  resolvePublicShareToken,
} from "./public-share-link.repo"

beforeEach(() => {
  vi.clearAllMocks()

  // $transaction ejecuta el callback con tx simulado
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      publicShareLink: {
        update: mockLinkUpdate,
        create: mockLinkCreate,
      },
      auditLog: { create: mockAuditLogCreate },
    }),
  )
})

// ─── createOrRotatePublicShareLink ────────────────────────────────────────────

describe("createOrRotatePublicShareLink", () => {
  it("1 — crea link nuevo cuando no hay activo", async () => {
    mockLinkFindFirst.mockResolvedValue(null)
    mockLinkCreate.mockResolvedValue({})

    const { token } = await createOrRotatePublicShareLink("org-1", "ev-1", "user-1")

    expect(typeof token).toBe("string")
    expect(token.length).toBeGreaterThan(10)
    expect(mockLinkUpdate).not.toHaveBeenCalled()
    expect(mockLinkCreate).toHaveBeenCalledTimes(1)
  })

  it("2 — con link activo existente → revoca el viejo y crea uno nuevo", async () => {
    mockLinkFindFirst.mockResolvedValue({ id: "link-old" })
    mockLinkUpdate.mockResolvedValue({})
    mockLinkCreate.mockResolvedValue({})

    await createOrRotatePublicShareLink("org-1", "ev-1", "user-1")

    expect(mockLinkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "link-old" },
        data: expect.objectContaining({ revokedAt: expect.any(Date), revokedByUserId: "user-1" }),
      }),
    )
    expect(mockLinkCreate).toHaveBeenCalledTimes(1)
  })
})

// ─── revokePublicShareLink ────────────────────────────────────────────────────

describe("revokePublicShareLink", () => {
  it("4 — setea revokedAt y revokedByUserId", async () => {
    mockLinkFindFirst.mockResolvedValue({ id: "link-1" })
    mockLinkUpdate.mockResolvedValue({})

    await revokePublicShareLink("org-1", "ev-1", "user-1")

    expect(mockLinkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "link-1" },
        data: expect.objectContaining({ revokedAt: expect.any(Date), revokedByUserId: "user-1" }),
      }),
    )
  })

  it("5 — sin link activo → BusinessError('NO_ACTIVE_LINK')", async () => {
    mockLinkFindFirst.mockResolvedValue(null)

    await expect(revokePublicShareLink("org-1", "ev-1", "user-1")).rejects.toMatchObject({
      code: "NO_ACTIVE_LINK",
    })
  })
})

// ─── findActivePublicShareLink ────────────────────────────────────────────────

describe("findActivePublicShareLink", () => {
  it("6 — devuelve null cuando todos están revocados", async () => {
    mockLinkFindFirst.mockResolvedValue(null)

    const result = await findActivePublicShareLink("org-1", "ev-1")
    expect(result).toBeNull()
  })
})

// ─── resolvePublicShareToken ──────────────────────────────────────────────────

describe("resolvePublicShareToken", () => {
  it("7 — devuelve snapshot del evento correcto para token válido", async () => {
    const mockSnapshot = { id: "snap-1", data: { ranking: [] }, organizationId: "org-1" }
    mockLinkFindUnique.mockResolvedValue({
      token: "abc",
      revokedAt: null,
      organizationId: "org-1",
      eventoId: "ev-1",
      evento: { leaderboardSnapshot: mockSnapshot },
    })

    const result = await resolvePublicShareToken("abc")

    expect(result).not.toBeNull()
    expect(result).not.toBe("REVOKED")
    if (result && result !== "REVOKED") {
      expect(result.eventoId).toBe("ev-1")
      expect(result.snapshot).toEqual(mockSnapshot)
    }
  })

  it("8 — token revocado → devuelve 'REVOKED'", async () => {
    mockLinkFindUnique.mockResolvedValue({
      token: "abc",
      revokedAt: new Date(),
      organizationId: "org-1",
      eventoId: "ev-1",
      evento: { leaderboardSnapshot: null },
    })

    const result = await resolvePublicShareToken("abc")
    expect(result).toBe("REVOKED")
  })

  it("9 — token inexistente → devuelve null", async () => {
    mockLinkFindUnique.mockResolvedValue(null)

    const result = await resolvePublicShareToken("inexistente")
    expect(result).toBeNull()
  })

  it("10 — evento sin snapshot → devuelve null", async () => {
    mockLinkFindUnique.mockResolvedValue({
      token: "abc",
      revokedAt: null,
      organizationId: "org-1",
      eventoId: "ev-1",
      evento: { leaderboardSnapshot: null },
    })

    const result = await resolvePublicShareToken("abc")
    expect(result).toBeNull()
  })
})
