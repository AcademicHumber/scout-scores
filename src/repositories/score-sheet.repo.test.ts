import { describe, it, expect, vi, beforeEach } from "vitest"
import { Decimal } from "@prisma/client/runtime/client"

// ─── Mocks ────────────────────────────────────────────────────────────────────

const {
  mockAsignacionFindFirst,
  mockScoreSheetFindUnique,
  mockScoreSheetCreate,
  mockScoreSheetUpdate,
  mockScoreSheetFindFirst,
  mockScoreEntryDeleteMany,
  mockScoreEntryCreateMany,
  mockTemplateCriterionFindMany,
  mockPatrullaFindUnique,
  mockTransaction,
} = vi.hoisted(() => ({
  mockAsignacionFindFirst:     vi.fn(),
  mockScoreSheetFindUnique:    vi.fn(),
  mockScoreSheetCreate:        vi.fn(),
  mockScoreSheetUpdate:        vi.fn(),
  mockScoreSheetFindFirst:     vi.fn(),
  mockScoreEntryDeleteMany:    vi.fn(),
  mockScoreEntryCreateMany:    vi.fn(),
  mockTemplateCriterionFindMany: vi.fn(),
  mockPatrullaFindUnique:      vi.fn(),
  mockTransaction:             vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  prisma: {
    asignacionPosta:    { findFirst: mockAsignacionFindFirst },
    scoreSheet:         { findUnique: mockScoreSheetFindUnique, create: mockScoreSheetCreate, update: mockScoreSheetUpdate, findFirst: mockScoreSheetFindFirst },
    scoreEntry:         { deleteMany: mockScoreEntryDeleteMany, createMany: mockScoreEntryCreateMany },
    templateCriterion:  { findMany: mockTemplateCriterionFindMany },
    patrulla:           { findUnique: mockPatrullaFindUnique },
    auditLog:           { create: vi.fn() },
    $transaction:       mockTransaction,
  },
}))

vi.mock("next/cache", () => ({
  unstable_cache: (_fn: () => unknown) => _fn,
  revalidateTag: vi.fn(),
}))

import { saveScoreSheet, submitScoreSheet, reopenScoreSheet } from "./score-sheet.repo"

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeCriterios(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `c${i + 1}`,
    nombre: `Criterio ${i + 1}`,
    tipo: "PUNTUABLE" as const,
    orden: i + 1,
  }))
}

function makeAsignacion({
  userId = "user-juez",
  isJuez = true,
  eventoEstado = "ACTIVO",
  templateModo = "CRITERIOS" as "CRITERIOS" | "PUNTAJE_UNICO",
  valoresValidos = [1, 2, 3, 4, 5],
  valoresValidosDesempate = [1, 2, 3],
  criterios = makeCriterios(3),
} = {}) {
  return {
    id: "asig-1",
    juezUserId: isJuez ? userId : "otro-juez",
    weight: new Decimal("1.5"),
    actividad: {
      evento: { id: "ev-1", estado: eventoEstado },
    },
    posta: {
      nombre: "Amarres básicos",
      template: {
        id: "tpl-1",
        modo: templateModo,
        valoresValidos: valoresValidos.map((v) => new Decimal(v)),
        valoresValidosDesempate: valoresValidosDesempate.map((v) => new Decimal(v)),
        criterios,
      },
    },
  }
}

function makeSheet(id = "sheet-1", estado: "BORRADOR" | "ENVIADA" = "BORRADOR") {
  return { id, estado, puntajeUnico: null, totalPuntuable: null, totalDesempate: null }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      scoreSheet: { findUnique: mockScoreSheetFindUnique, create: mockScoreSheetCreate, update: mockScoreSheetUpdate },
      scoreEntry:  { deleteMany: mockScoreEntryDeleteMany, createMany: mockScoreEntryCreateMany },
    }
    return fn(tx)
  })
})

// ─── saveScoreSheet ───────────────────────────────────────────────────────────

describe("saveScoreSheet", () => {
  it("caso 1 — juez asignado puede guardar borrador", async () => {
    mockAsignacionFindFirst.mockResolvedValue(makeAsignacion({ userId: "juez-1", isJuez: true }))
    mockScoreSheetFindUnique.mockResolvedValue(null) // no existe aún
    mockScoreSheetCreate.mockResolvedValue(makeSheet())

    const result = await saveScoreSheet(
      "org-1", "asig-1", "pat-1",
      { entries: [{ criterionId: "c1", valor: new Decimal("3") }] },
      "juez-1", false,
    )

    expect(result.id).toBe("sheet-1")
    expect(mockScoreSheetCreate).toHaveBeenCalledOnce()
  })

  it("caso 2 — juez NO asignado y no admin lanza FORBIDDEN_NO_ASIGNADO", async () => {
    mockAsignacionFindFirst.mockResolvedValue(makeAsignacion({ userId: "otro", isJuez: false }))

    await expect(
      saveScoreSheet("org-1", "asig-1", "pat-1", {}, "juez-ajeno", false),
    ).rejects.toMatchObject({ code: "FORBIDDEN_NO_ASIGNADO" })
  })

  it("caso 3 — admin sin ser juez asignado puede guardar", async () => {
    mockAsignacionFindFirst.mockResolvedValue(makeAsignacion({ isJuez: false }))
    mockScoreSheetFindUnique.mockResolvedValue(null)
    mockScoreSheetCreate.mockResolvedValue(makeSheet())

    await expect(
      saveScoreSheet("org-1", "asig-1", "pat-1", {}, "admin-user", true),
    ).resolves.toHaveProperty("id")
  })

  it("caso 4 — valor fuera de escala lanza VALOR_FUERA_DE_ESCALA", async () => {
    mockAsignacionFindFirst.mockResolvedValue(makeAsignacion({ userId: "juez-1", isJuez: true }))

    await expect(
      saveScoreSheet(
        "org-1", "asig-1", "pat-1",
        { entries: [{ criterionId: "c1", valor: new Decimal("7") }] }, // escala es 1-5
        "juez-1", false,
      ),
    ).rejects.toMatchObject({ code: "VALOR_FUERA_DE_ESCALA" })
  })

  it("caso 5 — segundo save (upsert) reemplaza entries en bloque", async () => {
    mockAsignacionFindFirst.mockResolvedValue(makeAsignacion({ userId: "juez-1", isJuez: true }))
    mockScoreSheetFindUnique.mockResolvedValue(makeSheet("sheet-existing")) // ya existe
    mockScoreSheetUpdate.mockResolvedValue(makeSheet("sheet-existing"))

    await saveScoreSheet(
      "org-1", "asig-1", "pat-1",
      { entries: [{ criterionId: "c1", valor: new Decimal("4") }] },
      "juez-1", false,
    )

    expect(mockScoreEntryDeleteMany).toHaveBeenCalledOnce()
    expect(mockScoreSheetCreate).not.toHaveBeenCalled()
    expect(mockScoreSheetUpdate).toHaveBeenCalledOnce()
  })
})

// ─── submitScoreSheet ─────────────────────────────────────────────────────────

describe("submitScoreSheet", () => {
  it("caso 6 — PUNTAJE_UNICO sin valor lanza PUNTAJE_UNICO_REQUERIDO", async () => {
    mockAsignacionFindFirst.mockResolvedValue(makeAsignacion({ userId: "juez-1", isJuez: true, templateModo: "PUNTAJE_UNICO", criterios: [] }))

    await expect(
      submitScoreSheet("org-1", "asig-1", "pat-1", {}, "juez-1", false),
    ).rejects.toMatchObject({ code: "PUNTAJE_UNICO_REQUERIDO" })
  })

  it("caso 7 — CRITERIOS sin todas las entries PUNTUABLE lanza CRITERIOS_FALTANTES", async () => {
    const criterios = makeCriterios(3) // 3 criterios PUNTUABLE
    mockAsignacionFindFirst.mockResolvedValue(makeAsignacion({ userId: "juez-1", isJuez: true, criterios }))

    await expect(
      submitScoreSheet(
        "org-1", "asig-1", "pat-1",
        { entries: [{ criterionId: "c1", valor: new Decimal("3") }] }, // faltan c2 y c3
        "juez-1", false,
      ),
    ).rejects.toMatchObject({
      code: "CRITERIOS_FALTANTES",
      meta: { criterios: expect.arrayContaining([{ id: "c2", nombre: "Criterio 2" }]) },
    })
  })

  it("caso 8 — CRITERIOS con escala secundaria de DESEMPATE calcula totales correctamente", async () => {
    const criterios = [
      { id: "c1", nombre: "Técnica", tipo: "PUNTUABLE" as const, orden: 1 },
      { id: "c2", nombre: "Solidez",  tipo: "PUNTUABLE" as const, orden: 2 },
      { id: "cd", nombre: "Espíritu", tipo: "DESEMPATE" as const, orden: 3 },
    ]
    const asig = makeAsignacion({
      userId: "juez-1",
      isJuez: true,
      criterios,
      valoresValidos: [1, 2, 3, 4, 5],
      valoresValidosDesempate: [1, 2, 3],
      // weight = 1.5 (from makeAsignacion)
    })
    mockAsignacionFindFirst.mockResolvedValue(asig)
    mockScoreSheetFindUnique.mockResolvedValue(null)
    mockScoreSheetCreate.mockResolvedValue({ id: "sheet-1", estado: "ENVIADA" })

    const result = await submitScoreSheet(
      "org-1", "asig-1", "pat-1",
      {
        entries: [
          { criterionId: "c1", valor: new Decimal("4") }, // PUNTUABLE
          { criterionId: "c2", valor: new Decimal("1") }, // PUNTUABLE → suma=5
          { criterionId: "cd", valor: new Decimal("2") }, // DESEMPATE
        ],
      },
      "juez-1", false,
    )

    // totalPuntuable = (4 + 1) × 1.5 = 7.5
    // totalDesempate = 2 (sin weight)
    expect(result.totalPuntuable.toString()).toBe("7.5")
    expect(result.totalDesempate.toString()).toBe("2")

    const createCall = mockScoreSheetCreate.mock.calls[0][0]
    expect(createCall.data.totalPuntuable.toString()).toBe("7.5")
    expect(createCall.data.totalDesempate.toString()).toBe("2")
    expect(createCall.data.estado).toBe("ENVIADA")
  })

  it("caso 9 — PUNTAJE_UNICO con DESEMPATE calcula totales correctamente", async () => {
    const criterios = [
      { id: "cd", nombre: "Espíritu", tipo: "DESEMPATE" as const, orden: 1 },
    ]
    mockAsignacionFindFirst.mockResolvedValue(
      makeAsignacion({
        userId: "juez-1",
        isJuez: true,
        templateModo: "PUNTAJE_UNICO",
        criterios,
        valoresValidos: [0, 25, 50, 75, 100],
        valoresValidosDesempate: [1, 2, 3],
        // weight = 1.5
      }),
    )
    mockScoreSheetFindUnique.mockResolvedValue(null)
    mockScoreSheetCreate.mockResolvedValue({ id: "s1", estado: "ENVIADA" })

    const result = await submitScoreSheet(
      "org-1", "asig-1", "pat-1",
      {
        puntajeUnico: new Decimal("75"),
        entries: [{ criterionId: "cd", valor: new Decimal("3") }], // DESEMPATE (escala: [1,2,3])
      },
      "juez-1", false,
    )

    // totalPuntuable = 75 × 1.5 = 112.5
    // totalDesempate = 3
    expect(result.totalPuntuable.toString()).toBe("112.5")
    expect(result.totalDesempate.toString()).toBe("3")
  })

  it("caso 10 — evento NO ACTIVO lanza EVENTO_NO_ACTIVO", async () => {
    mockAsignacionFindFirst.mockResolvedValue(
      makeAsignacion({ userId: "juez-1", isJuez: true, eventoEstado: "CERRADO" }),
    )

    await expect(
      submitScoreSheet("org-1", "asig-1", "pat-1", {}, "juez-1", false),
    ).rejects.toMatchObject({ code: "EVENTO_NO_ACTIVO" })
  })
})

// ─── reopenScoreSheet ─────────────────────────────────────────────────────────

describe("reopenScoreSheet", () => {
  it("caso 11 — admin reabre planilla ENVIADA: estado BORRADOR, totales null, reopenedAt set", async () => {
    mockScoreSheetFindFirst.mockResolvedValue({ id: "sheet-1", estado: "ENVIADA" })
    mockScoreSheetUpdate.mockResolvedValue({})

    await reopenScoreSheet("org-1", "sheet-1", "admin-user")

    const updateCall = mockScoreSheetUpdate.mock.calls[0][0]
    expect(updateCall.data.estado).toBe("BORRADOR")
    expect(updateCall.data.totalPuntuable).toBeNull()
    expect(updateCall.data.totalDesempate).toBeNull()
    expect(updateCall.data.reopenedAt).toBeInstanceOf(Date)
    expect(updateCall.data.reopenedByUserId).toBe("admin-user")
  })

  it("caso 12 — reabrir planilla en BORRADOR lanza SCORE_SHEET_NO_ENVIADA", async () => {
    mockScoreSheetFindFirst.mockResolvedValue({ id: "sheet-1", estado: "BORRADOR" })

    await expect(
      reopenScoreSheet("org-1", "sheet-1", "admin-user"),
    ).rejects.toMatchObject({ code: "SCORE_SHEET_NO_ENVIADA" })
  })

  it("planilla no encontrada lanza SCORE_SHEET_NO_ENCONTRADA", async () => {
    mockScoreSheetFindFirst.mockResolvedValue(null)

    await expect(
      reopenScoreSheet("org-1", "no-existe", "admin-user"),
    ).rejects.toMatchObject({ code: "SCORE_SHEET_NO_ENCONTRADA" })
  })
})
