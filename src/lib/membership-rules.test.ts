import { describe, it, expect } from "vitest"
import { BusinessError } from "@/lib/errors"

describe("BusinessError", () => {
  it("sets name and code", () => {
    const err = new BusinessError("LAST_ADMIN")
    expect(err.name).toBe("BusinessError")
    expect(err.code).toBe("LAST_ADMIN")
    expect(err.message).toBe("LAST_ADMIN")
    expect(err).toBeInstanceOf(Error)
  })

  it("stores optional meta", () => {
    const err = new BusinessError("HAS_MIEMBROS", { count: 3 })
    expect(err.meta).toEqual({ count: 3 })
  })
})
