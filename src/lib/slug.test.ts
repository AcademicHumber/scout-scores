import { describe, it, expect } from "vitest"
import { slugify } from "./slug"

describe("slugify", () => {
  it("convierte espacios a guiones", () => {
    expect(slugify("Jornada Distrital")).toBe("jornada-distrital")
  })

  it("elimina tildes", () => {
    expect(slugify("Competición Anual")).toBe("competicion-anual")
  })

  it("elimina caracteres especiales", () => {
    expect(slugify("Evento #1 (2026)!")).toBe("evento-1-2026")
  })

  it("convierte a minúsculas", () => {
    expect(slugify("JORNADA SCOUT")).toBe("jornada-scout")
  })

  it("recorta guiones extra al inicio y fin", () => {
    expect(slugify("  hola mundo  ")).toBe("hola-mundo")
  })

  it("colapsa múltiples guiones", () => {
    expect(slugify("hello---world")).toBe("hello-world")
  })

  it("limita a 50 caracteres", () => {
    const largo = "a".repeat(60)
    expect(slugify(largo).length).toBe(50)
  })

  it("maneja string vacío", () => {
    expect(slugify("")).toBe("")
  })

  it("maneja ñ", () => {
    expect(slugify("Año Scout")).toBe("ano-scout")
  })
})
