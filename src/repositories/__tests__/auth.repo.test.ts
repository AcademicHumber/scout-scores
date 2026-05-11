import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Mocks ────────────────────────────────────────────────────────────────────

const {
  mockUserFindUnique,
  mockUserCreate,
  mockUserUpdate,
  mockAttemptFindUnique,
  mockAttemptUpsert,
  mockAttemptUpdate,
  mockAccountCreate,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockUserCreate: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockAttemptFindUnique: vi.fn(),
  mockAttemptUpsert: vi.fn(),
  mockAttemptUpdate: vi.fn(),
  mockAccountCreate: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
      update: mockUserUpdate,
    },
    authAttempt: {
      findUnique: mockAttemptFindUnique,
      upsert: mockAttemptUpsert,
      update: mockAttemptUpdate,
    },
    account: {
      create: mockAccountCreate,
    },
  },
}))

import {
  recordFailedAttempt,
  clearFailedAttempts,
  isLocked,
  setUserPasswordIfNull,
} from "../auth.repo"
import { BusinessError } from "@/lib/errors"
import { LOCKOUT_THRESHOLD } from "@/lib/auth-credentials"

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── recordFailedAttempt ──────────────────────────────────────────────────────

describe("recordFailedAttempt", () => {
  it("no lockea cuando failCount < threshold", async () => {
    mockAttemptUpsert.mockResolvedValue({ failCount: 2 })
    const result = await recordFailedAttempt("test@demo.org")
    expect(result.locked).toBe(false)
    expect(mockAttemptUpdate).not.toHaveBeenCalled()
  })

  it("lockea y actualiza lockedUntil cuando failCount >= threshold", async () => {
    mockAttemptUpsert.mockResolvedValue({ failCount: LOCKOUT_THRESHOLD })
    mockAttemptUpdate.mockResolvedValue({})
    const result = await recordFailedAttempt("test@demo.org")
    expect(result.locked).toBe(true)
    expect(mockAttemptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "test@demo.org" },
        data: expect.objectContaining({ lockedUntil: expect.any(Date) }),
      }),
    )
  })
})

// ─── isLocked ─────────────────────────────────────────────────────────────────

describe("isLocked", () => {
  it("retorna false si no hay registro", async () => {
    mockAttemptFindUnique.mockResolvedValue(null)
    expect(await isLocked("x@x.com")).toBe(false)
  })

  it("retorna false si lockedUntil está en el pasado", async () => {
    const past = new Date(Date.now() - 1000)
    mockAttemptFindUnique.mockResolvedValue({ lockedUntil: past })
    expect(await isLocked("x@x.com")).toBe(false)
  })

  it("retorna true si lockedUntil está en el futuro", async () => {
    const future = new Date(Date.now() + 10 * 60 * 1000)
    mockAttemptFindUnique.mockResolvedValue({ lockedUntil: future })
    expect(await isLocked("x@x.com")).toBe(true)
  })
})

// ─── clearFailedAttempts ──────────────────────────────────────────────────────

describe("clearFailedAttempts", () => {
  it("hace upsert con failCount 0", async () => {
    mockAttemptUpsert.mockResolvedValue({})
    await clearFailedAttempts("test@demo.org")
    expect(mockAttemptUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "test@demo.org" },
        update: { failCount: 0 },
      }),
    )
  })
})

// ─── setUserPasswordIfNull ────────────────────────────────────────────────────

describe("setUserPasswordIfNull", () => {
  it("actualiza el passwordHash si era null", async () => {
    mockUserFindUnique.mockResolvedValue({ passwordHash: null })
    mockUserUpdate.mockResolvedValue({})
    await setUserPasswordIfNull("user-id", "hashed")
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-id" },
        data: { passwordHash: "hashed" },
      }),
    )
  })

  it("lanza BusinessError PASSWORD_ALREADY_SET si ya tenía password", async () => {
    mockUserFindUnique.mockResolvedValue({ passwordHash: "$2b$10$existing" })
    await expect(setUserPasswordIfNull("user-id", "new-hash")).rejects.toThrow(BusinessError)
    await expect(setUserPasswordIfNull("user-id", "new-hash")).rejects.toMatchObject({
      code: "PASSWORD_ALREADY_SET",
    })
  })

  it("lanza BusinessError NOT_FOUND si el user no existe", async () => {
    mockUserFindUnique.mockResolvedValue(null)
    await expect(setUserPasswordIfNull("missing-id", "hash")).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  })
})
