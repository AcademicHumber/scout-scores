import { describe, it, expect, vi, beforeEach } from "vitest"
import { Decimal } from "@prisma/client/runtime/client"

// ─── Mocks ────────────────────────────────────────────────────────────────────

const {
  mockEventoFindFirst,
  mockSnapshotFindUnique,
  mockSnapshotUpsert,
  mockScoreSheetAggregate,
  mockAuditLogCreate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockEventoFindFirst:     vi.fn(),
  mockSnapshotFindUnique:  vi.fn(),
  mockSnapshotUpsert:      vi.fn(),
  mockScoreSheetAggregate: vi.fn(),
  mockAuditLogCreate:      vi.fn(),
  mockTransaction:         vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  prisma: {
    evento: { findFirst: mockEventoFindFirst },
    eventLeaderboardSnapshot: {
      findUnique: mockSnapshotFindUnique,
      upsert: mockSnapshotUpsert,
    },
    scoreSheet: { aggregate: mockScoreSheetAggregate },
    auditLog: { create: mockAuditLogCreate },
    $transaction: mockTransaction,
  },
}))

vi.mock("next/cache", () => ({
  unstable_cache: (_fn: () => unknown) => _fn,
  revalidateTag: vi.fn(),
}))

import {
  computeLeaderboard,
  generateLeaderboardSnapshot,
  isSnapshotStale,
} from "./leaderboard.repo"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvento(overrides: {
  actividades?: Array<{
    id: string
    nombre: string
    pesoRelativo: number
    asignaciones: Array<{
      id: string
      posta: { id: string; nombre: string }
      weight: number
      scoreSheets: Array<{
        patrullaId: string
        totalPuntuable: Decimal | null
        totalDesempate: Decimal | null
      }>
    }>
  }>
  patrullas?: Array<{
    id: string
    nombre: string
    grupoScout: { id: string; nombre: string }
  }>
} = {}) {
  return {
    id: "ev-1",
    nombre: "Gran Jamboree",
    lugar: "Campo Verde",
    fechaInicio: new Date("2025-06-01"),
    fechaFin: new Date("2025-06-03"),
    organization: { nombre: "Distrito Norte" },
    actividades: overrides.actividades ?? [],
    patrullas: overrides.patrullas ?? [],
  }
}

const pat1 = { id: "pat-1", nombre: "Lobos", grupoScout: { id: "g1", nombre: "Grupo 1" } }
const pat2 = { id: "pat-2", nombre: "Aguila", grupoScout: { id: "g1", nombre: "Grupo 1" } }
const pat3 = { id: "pat-3", nombre: "Zorro", grupoScout: { id: "g2", nombre: "Grupo 2" } }

beforeEach(() => {
  vi.clearAllMocks()
  // Por defecto, $transaction ejecuta el callback con un proxy que llama los métodos del prisma mock
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
    eventLeaderboardSnapshot: { upsert: mockSnapshotUpsert },
    auditLog: { create: mockAuditLogCreate },
  }))
})

// ─── computeLeaderboard ───────────────────────────────────────────────────────

describe("computeLeaderboard", () => {
  it("1 — evento sin patrullas → ranking vacío, grupos vacíos", async () => {
    mockEventoFindFirst.mockResolvedValue(makeEvento())

    const result = await computeLeaderboard("org-1", "ev-1")

    expect(result.ranking).toHaveLength(0)
    expect(result.grupos).toHaveLength(0)
    expect(result.eventoNombre).toBe("Gran Jamboree")
  })

  it("2 — 1 actividad (peso 100), 1 posta (weight 1), 2 patrullas → ordenado correctamente", async () => {
    mockEventoFindFirst.mockResolvedValue(makeEvento({
      actividades: [{
        id: "act-1", nombre: "Cocina", pesoRelativo: 100,
        asignaciones: [{
          id: "asig-1", posta: { id: "p1", nombre: "Posta Cocina" }, weight: 1,
          scoreSheets: [
            { patrullaId: "pat-1", totalPuntuable: new Decimal(80), totalDesempate: new Decimal(0) },
            { patrullaId: "pat-2", totalPuntuable: new Decimal(90), totalDesempate: new Decimal(0) },
          ],
        }],
      }],
      patrullas: [pat1, pat2],
    }))

    const result = await computeLeaderboard("org-1", "ev-1")

    expect(result.ranking).toHaveLength(2)
    expect(result.ranking[0]!.patrullaNombre).toBe("Aguila")
    expect(result.ranking[0]!.totalPuntuable).toBeCloseTo(90)
    expect(result.ranking[1]!.patrullaNombre).toBe("Lobos")
    expect(result.ranking[1]!.totalPuntuable).toBeCloseTo(80)
  })

  it("3 — 2 actividades (60/40), 1 posta cada una → cálculo proporcional correcto", async () => {
    mockEventoFindFirst.mockResolvedValue(makeEvento({
      actividades: [
        {
          id: "act-1", nombre: "A1", pesoRelativo: 60,
          asignaciones: [{
            id: "asig-1", posta: { id: "p1", nombre: "P1" }, weight: 1,
            scoreSheets: [{ patrullaId: "pat-1", totalPuntuable: new Decimal(100), totalDesempate: new Decimal(0) }],
          }],
        },
        {
          id: "act-2", nombre: "A2", pesoRelativo: 40,
          asignaciones: [{
            id: "asig-2", posta: { id: "p2", nombre: "P2" }, weight: 1,
            scoreSheets: [{ patrullaId: "pat-1", totalPuntuable: new Decimal(100), totalDesempate: new Decimal(0) }],
          }],
        },
      ],
      patrullas: [pat1],
    }))

    const result = await computeLeaderboard("org-1", "ev-1")

    // 100 × 1 × (60/100) + 100 × 1 × (40/100) = 60 + 40 = 100
    expect(result.ranking[0]!.totalPuntuable).toBeCloseTo(100)
  })

  it("4 — asignación con weight ≠ 1 → multiplicación correcta", async () => {
    mockEventoFindFirst.mockResolvedValue(makeEvento({
      actividades: [{
        id: "act-1", nombre: "A1", pesoRelativo: 100,
        asignaciones: [{
          id: "asig-1", posta: { id: "p1", nombre: "P1" }, weight: 2,
          scoreSheets: [{ patrullaId: "pat-1", totalPuntuable: new Decimal(50), totalDesempate: new Decimal(0) }],
        }],
      }],
      patrullas: [pat1],
    }))

    const result = await computeLeaderboard("org-1", "ev-1")

    // 50 × 2 × (100/100) = 100
    expect(result.ranking[0]!.totalPuntuable).toBeCloseTo(100)
  })

  it("5 — patrulla sin scoreSheet en una posta → cuenta como 0", async () => {
    mockEventoFindFirst.mockResolvedValue(makeEvento({
      actividades: [{
        id: "act-1", nombre: "A1", pesoRelativo: 100,
        asignaciones: [{
          id: "asig-1", posta: { id: "p1", nombre: "P1" }, weight: 1,
          scoreSheets: [
            // pat-1 no tiene planilla, pat-2 sí
            { patrullaId: "pat-2", totalPuntuable: new Decimal(80), totalDesempate: new Decimal(0) },
          ],
        }],
      }],
      patrullas: [pat1, pat2],
    }))

    const result = await computeLeaderboard("org-1", "ev-1")

    const rowPat1 = result.ranking.find((r) => r.patrullaId === "pat-1")!
    const rowPat2 = result.ranking.find((r) => r.patrullaId === "pat-2")!

    expect(rowPat1.totalPuntuable).toBeCloseTo(0)
    expect(rowPat2.totalPuntuable).toBeCloseTo(80)
    expect(rowPat1.detalle[0]!.postas[0]!.totalPuntuable).toBeNull()
  })

  it("6 — scoreSheet en BORRADOR → cuenta como 0 (no se incluye porque query filtra ENVIADA)", async () => {
    // La query solo incluye scoreSheets con estado ENVIADA — simulamos que no llega ninguna
    mockEventoFindFirst.mockResolvedValue(makeEvento({
      actividades: [{
        id: "act-1", nombre: "A1", pesoRelativo: 100,
        asignaciones: [{
          id: "asig-1", posta: { id: "p1", nombre: "P1" }, weight: 1,
          scoreSheets: [], // BORRADOR filtrada por la query
        }],
      }],
      patrullas: [pat1],
    }))

    const result = await computeLeaderboard("org-1", "ev-1")

    expect(result.ranking[0]!.totalPuntuable).toBeCloseTo(0)
  })

  it("7 — empate puntuable, desempate resuelve → orden correcto", async () => {
    mockEventoFindFirst.mockResolvedValue(makeEvento({
      actividades: [{
        id: "act-1", nombre: "A1", pesoRelativo: 100,
        asignaciones: [{
          id: "asig-1", posta: { id: "p1", nombre: "P1" }, weight: 1,
          scoreSheets: [
            { patrullaId: "pat-1", totalPuntuable: new Decimal(90), totalDesempate: new Decimal(5) },
            { patrullaId: "pat-2", totalPuntuable: new Decimal(90), totalDesempate: new Decimal(8) },
          ],
        }],
      }],
      patrullas: [pat1, pat2],
    }))

    const result = await computeLeaderboard("org-1", "ev-1")

    expect(result.ranking[0]!.patrullaId).toBe("pat-2") // mayor desempate
    expect(result.ranking[1]!.patrullaId).toBe("pat-1")
    expect(result.ranking[0]!.posicion).toBe(1)
    expect(result.ranking[1]!.posicion).toBe(2)
  })

  it("8 — empate persistente (mismo puntuable y desempate) → comparten posición, siguiente salta ordinal", async () => {
    mockEventoFindFirst.mockResolvedValue(makeEvento({
      actividades: [{
        id: "act-1", nombre: "A1", pesoRelativo: 100,
        asignaciones: [{
          id: "asig-1", posta: { id: "p1", nombre: "P1" }, weight: 1,
          scoreSheets: [
            { patrullaId: "pat-1", totalPuntuable: new Decimal(100), totalDesempate: new Decimal(10) },
            { patrullaId: "pat-2", totalPuntuable: new Decimal(90), totalDesempate: new Decimal(5) },
            { patrullaId: "pat-3", totalPuntuable: new Decimal(90), totalDesempate: new Decimal(5) },
          ],
        }],
      }],
      patrullas: [pat1, pat2, pat3],
    }))

    const result = await computeLeaderboard("org-1", "ev-1")

    expect(result.ranking[0]!.posicion).toBe(1)
    expect(result.ranking[0]!.totalPuntuable).toBeCloseTo(100)

    const pos2rows = result.ranking.filter((r) => r.totalPuntuable < 95)
    expect(pos2rows.length).toBe(2)
    expect(pos2rows[0]!.posicion).toBe(2)
    expect(pos2rows[1]!.posicion).toBe(2)
  })

  it("9 — solo criterios DESEMPATE → no afectan totalPuntuable, sí totalDesempate", async () => {
    mockEventoFindFirst.mockResolvedValue(makeEvento({
      actividades: [{
        id: "act-1", nombre: "A1", pesoRelativo: 100,
        asignaciones: [{
          id: "asig-1", posta: { id: "p1", nombre: "P1" }, weight: 1,
          scoreSheets: [
            { patrullaId: "pat-1", totalPuntuable: new Decimal(0), totalDesempate: new Decimal(7) },
          ],
        }],
      }],
      patrullas: [pat1],
    }))

    const result = await computeLeaderboard("org-1", "ev-1")

    expect(result.ranking[0]!.totalPuntuable).toBeCloseTo(0)
    expect(result.ranking[0]!.totalDesempate).toBeCloseTo(7)
  })

  it("13 — tenant isolation: evento de otra org no se encuentra", async () => {
    mockEventoFindFirst.mockResolvedValue(null) // org distinta = no encontrado

    await expect(computeLeaderboard("org-X", "ev-1")).rejects.toThrow()
  })
})

// ─── generateLeaderboardSnapshot ─────────────────────────────────────────────

describe("generateLeaderboardSnapshot", () => {
  it("10 — upsert idempotente: segunda llamada sobreescribe, no duplica", async () => {
    const snapshotData = makeEvento()
    mockEventoFindFirst.mockResolvedValue(snapshotData)

    const now = new Date()
    mockSnapshotUpsert.mockResolvedValue({ generatedAt: now })

    await generateLeaderboardSnapshot("org-1", "ev-1", "user-1")
    await generateLeaderboardSnapshot("org-1", "ev-1", "user-1")

    // Debe haber sido llamado 2 veces (upsert, no create)
    expect(mockSnapshotUpsert).toHaveBeenCalledTimes(2)
    const call = mockSnapshotUpsert.mock.calls[0]![0]
    expect(call.where).toEqual({ eventoId: "ev-1" })
    expect(call.create).toBeDefined()
    expect(call.update).toBeDefined()
  })
})

// ─── isSnapshotStale ──────────────────────────────────────────────────────────

describe("isSnapshotStale", () => {
  it("11 — true cuando scoreSheet.updatedAt > snapshot.generatedAt", async () => {
    const generatedAt = new Date("2025-01-01T10:00:00Z")
    const lastUpdate  = new Date("2025-01-01T11:00:00Z")

    mockSnapshotFindUnique.mockResolvedValue({ generatedAt, organizationId: "org-1" })
    mockScoreSheetAggregate.mockResolvedValue({ _max: { updatedAt: lastUpdate } })

    const stale = await isSnapshotStale("org-1", "ev-1")
    expect(stale).toBe(true)
  })

  it("12 — false cuando no hay snapshot", async () => {
    mockSnapshotFindUnique.mockResolvedValue(null)

    const stale = await isSnapshotStale("org-1", "ev-1")
    expect(stale).toBe(false)
  })
})
