import { describe, it, expect } from "vitest"
import {
  hashPassword,
  verifyPassword,
  normalizeEmail,
  signupSchema,
  setPasswordSchema,
} from "../auth-credentials"

describe("hashPassword + verifyPassword", () => {
  it("roundtrip: verifica el plain contra el hash", async () => {
    const hash = await hashPassword("scout1234")
    expect(await verifyPassword("scout1234", hash)).toBe(true)
  })

  it("retorna false con password incorrecto", async () => {
    const hash = await hashPassword("scout1234")
    expect(await verifyPassword("otraclave", hash)).toBe(false)
  })
})

describe("normalizeEmail", () => {
  it("baja a minúsculas", () => {
    expect(normalizeEmail("Admin@Demo.ORG")).toBe("admin@demo.org")
  })

  it("elimina espacios", () => {
    expect(normalizeEmail("  admin@demo.org  ")).toBe("admin@demo.org")
  })
})

describe("signupSchema", () => {
  it("rechaza contraseña corta", () => {
    const result = signupSchema.safeParse({ name: "Pepe", email: "a@b.com", password: "1234" })
    expect(result.success).toBe(false)
  })

  it("rechaza email inválido", () => {
    const result = signupSchema.safeParse({ name: "Pepe", email: "no-es-email", password: "scout1234" })
    expect(result.success).toBe(false)
  })

  it("acepta datos válidos", () => {
    const result = signupSchema.safeParse({ name: "Pepe", email: "a@b.com", password: "scout1234" })
    expect(result.success).toBe(true)
  })
})

describe("setPasswordSchema", () => {
  it("rechaza contraseña corta", () => {
    const result = setPasswordSchema.safeParse({ password: "abc" })
    expect(result.success).toBe(false)
  })

  it("acepta contraseña válida", () => {
    const result = setPasswordSchema.safeParse({ password: "scout1234" })
    expect(result.success).toBe(true)
  })
})
