import { describe, it, expect, vi, beforeEach } from "vitest"
import { Decimal } from "@prisma/client/runtime/client"

// ─── Mocks ────────────────────────────────────────────────────────────────────

const {
  mockEventoFindFirst,
  mockEventoFindMany,
  mockEventoCreate,
  mockEventoUpdate,
  mockEventoDelete,
  mockEventoCount,
  mockActividadFindMany,
  mockActividadFindFirst,
  mockActividadCreate,
  mockActividadUpdate,
  mockActividadDelete,
  mockActividadAggregate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockEventoFindFirst:  vi.fn(),
  mockEventoFindMany:   vi.fn(),
  mockEventoCreate:     vi.fn(),
  mockEventoUpdate:     vi.fn(),
  mockEventoDelete:     vi.fn(),
  mockEventoCount:      vi.fn(),
  mockActividadFindMany: vi.fn(),
  mockActividadFindFirst: vi.fn(),
  mockActividadCreate:  vi.fn(),
  mockActividadUpdate:  vi.fn(),
  mockActividadDelete:  vi.fn(),
  mockActividadAggregate: vi.fn(),
  mockTransaction:      vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  prisma: {
    evento: {
      findFirst: mockEventoFindFirst,
      findMany:  mockEventoFindMany,
      create:    mockEventoCreate,
      update:    mockEventoUpdate,
      delete:    mockEventoDelete,
      count:     mockEventoCount,
    },
    actividad: {
      findFirst:  mockActividadFindFirst,
      findMany:   mockActividadFindMany,
      create:     mockActividadCreate,
      update:     mockActividadUpdate,
      delete:     mockActividadDelete,
      aggregate:  mockActividadAggregate,
    },
    auditLog: { create: vi.fn() },
    $transaction: mockTransaction,
  },
}))

vi.mock("next/cache", () => ({
  unstable_cache: (_fn: () => unknown) => _fn,
  revalidateTag: vi.fn(),
}))

import {
  createEvento,
  deleteEvento,
  transicionarEstado,
  addActividad,
  updateActividad,
  deleteActividad,
  reorderActividad,
  countEventosActivos,
  isEventoLocked,
} from "./evento.repo"

beforeEach(() => {
  vi.clearAllMocks()
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      evento:   { create: mockEventoCreate, update: mockEventoUpdate, delete: mockEventoDelete },
      actividad: { create: mockActividadCreate, update: mockActividadUpdate, delete: mockActividadDelete, findMany: mockActividadFindMany },
      auditLog: { create: vi.fn() },
    }
    return fn(tx)
  })
})

// ─── createEvento slug ────────────────────────────────────────────────────────

describe("createEvento slug", () => {
  it("genera slug desde nombre", async () => {
    mockEventoFindFirst.mockResolvedValueOnce(null)
    mockEventoCreate.mockResolvedValue({ id: "ev-1", nombre: "Jornada Distrital", slug: "jornada-distrital" })

    const result = await createEvento("org-1", { nombre: "Jornada Distrital", fechaInicio: new Date("2026-08-15") }, "user-1")

    const call = mockEventoCreate.mock.calls[0][0]
    expect(call.data.slug).toBe("jornada-distrital")
    expect(result.slug).toBe("jornada-distrital")
  })

  it("resuelve colisión con sufijo -2", async () => {
    mockEventoFindFirst
      .mockResolvedValueOnce({ id: "otro" })
      .mockResolvedValueOnce(null)
    mockEventoCreate.mockResolvedValue({ id: "ev-2", nombre: "Jornada Distrital 2026", slug: "jornada-distrital-2026-2" })

    const result = await createEvento("org-1", { nombre: "Jornada Distrital 2026", fechaInicio: new Date("2026-08-15") }, "user-1")

    expect(result.slug).toBe("jornada-distrital-2026-2")
  })

  it("rechaza fechaFin < fechaInicio", async () => {
    await expect(
      createEvento("org-1", { nombre: "Test", fechaInicio: new Date("2026-08-15"), fechaFin: new Date("2026-08-13") }, "user-1"),
    ).rejects.toMatchObject({ name: "BusinessError", code: "FECHA_INVALIDA" })
  })

  it("acepta fechaFin = fechaInicio", async () => {
    mockEventoFindFirst.mockResolvedValueOnce(null)
    mockEventoCreate.mockResolvedValue({ id: "ev-3", nombre: "Test", slug: "test" })

    await expect(
      createEvento("org-1", { nombre: "Test", fechaInicio: new Date("2026-08-15"), fechaFin: new Date("2026-08-15") }, "user-1"),
    ).resolves.toBeDefined()
  })

  it("acepta sin fechaFin", async () => {
    mockEventoFindFirst.mockResolvedValueOnce(null)
    mockEventoCreate.mockResolvedValue({ id: "ev-4", nombre: "Test", slug: "test" })

    await expect(
      createEvento("org-1", { nombre: "Test", fechaInicio: new Date("2026-08-15") }, "user-1"),
    ).resolves.toBeDefined()
  })
})

// ─── deleteEvento ─────────────────────────────────────────────────────────────

describe("deleteEvento", () => {
  it("elimina evento BORRADOR", async () => {
    mockEventoFindFirst.mockResolvedValue({ id: "ev-1", nombre: "Test", estado: "BORRADOR" })
    mockEventoDelete.mockResolvedValue({})

    await expect(deleteEvento("org-1", "ev-1", "user-1")).resolves.toBeUndefined()
  })

  it("rechaza eliminar evento ACTIVO", async () => {
    mockEventoFindFirst.mockResolvedValue({ id: "ev-1", nombre: "Test", estado: "ACTIVO" })

    await expect(deleteEvento("org-1", "ev-1", "user-1")).rejects.toMatchObject({ code: "NO_DELETABLE", meta: { estadoActual: "ACTIVO" } })
  })

  it("rechaza eliminar evento CERRADO", async () => {
    mockEventoFindFirst.mockResolvedValue({ id: "ev-1", nombre: "Test", estado: "CERRADO" })

    await expect(deleteEvento("org-1", "ev-1", "user-1")).rejects.toMatchObject({ code: "NO_DELETABLE" })
  })
})

// ─── transicionarEstado ───────────────────────────────────────────────────────

describe("transicionarEstado", () => {
  it("BORRADOR → ACTIVO con actividades sumando 100", async () => {
    mockEventoFindFirst.mockResolvedValue({ id: "ev-1", estado: "BORRADOR" })
    mockActividadFindMany.mockResolvedValue([
      { id: "a1", pesoRelativo: new Decimal("30") },
      { id: "a2", pesoRelativo: new Decimal("45") },
      { id: "a3", pesoRelativo: new Decimal("25") },
    ])
    mockEventoUpdate.mockResolvedValue({})

    await transicionarEstado("org-1", "ev-1", "ACTIVO", "user-1")

    const call = mockEventoUpdate.mock.calls[0][0]
    expect(call.data.estado).toBe("ACTIVO")
    expect(call.data.activatedAt).toBeInstanceOf(Date)
  })

  it("BORRADOR → ACTIVO sin actividades lanza PESOS_INVALIDOS sinActividades", async () => {
    mockEventoFindFirst.mockResolvedValue({ id: "ev-1", estado: "BORRADOR" })
    mockActividadFindMany.mockResolvedValue([])

    await expect(transicionarEstado("org-1", "ev-1", "ACTIVO", "user-1")).rejects.toMatchObject({
      code: "PESOS_INVALIDOS",
      meta: expect.objectContaining({ sinActividades: true }),
    })
  })

  it("BORRADOR → ACTIVO con suma=80 lanza PESOS_INVALIDOS", async () => {
    mockEventoFindFirst.mockResolvedValue({ id: "ev-1", estado: "BORRADOR" })
    mockActividadFindMany.mockResolvedValue([{ id: "a1", pesoRelativo: new Decimal("80") }])

    await expect(transicionarEstado("org-1", "ev-1", "ACTIVO", "user-1")).rejects.toMatchObject({
      code: "PESOS_INVALIDOS",
      meta: expect.objectContaining({ sumaActual: 80, faltante: 20 }),
    })
  })

  it("BORRADOR → ACTIVO con suma=99.99 es válido (tolerancia 0.01)", async () => {
    mockEventoFindFirst.mockResolvedValue({ id: "ev-1", estado: "BORRADOR" })
    mockActividadFindMany.mockResolvedValue([
      { id: "a1", pesoRelativo: new Decimal("33.33") },
      { id: "a2", pesoRelativo: new Decimal("33.33") },
      { id: "a3", pesoRelativo: new Decimal("33.33") },
    ])
    mockEventoUpdate.mockResolvedValue({})

    await expect(transicionarEstado("org-1", "ev-1", "ACTIVO", "user-1")).resolves.toBeUndefined()
  })

  it("BORRADOR → ACTIVO con suma=99.98 falla (fuera de tolerancia)", async () => {
    mockEventoFindFirst.mockResolvedValue({ id: "ev-1", estado: "BORRADOR" })
    mockActividadFindMany.mockResolvedValue([
      { id: "a1", pesoRelativo: new Decimal("33.33") },
      { id: "a2", pesoRelativo: new Decimal("33.33") },
      { id: "a3", pesoRelativo: new Decimal("33.32") },
    ])

    await expect(transicionarEstado("org-1", "ev-1", "ACTIVO", "user-1")).rejects.toMatchObject({ code: "PESOS_INVALIDOS" })
  })

  it("ACTIVO → CERRADO setea closedAt sin activatedAt", async () => {
    mockEventoFindFirst.mockResolvedValue({ id: "ev-1", estado: "ACTIVO" })
    mockEventoUpdate.mockResolvedValue({})

    await transicionarEstado("org-1", "ev-1", "CERRADO", "user-1")

    const call = mockEventoUpdate.mock.calls[0][0]
    expect(call.data.estado).toBe("CERRADO")
    expect(call.data.closedAt).toBeInstanceOf(Date)
    expect(call.data.activatedAt).toBeUndefined()
  })

  it("BORRADOR → CERRADO (saltear) lanza INVALID_TRANSITION", async () => {
    mockEventoFindFirst.mockResolvedValue({ id: "ev-1", estado: "BORRADOR" })

    await expect(transicionarEstado("org-1", "ev-1", "CERRADO", "user-1")).rejects.toMatchObject({ code: "INVALID_TRANSITION" })
  })

  it("CERRADO → ACTIVO (reverso) lanza INVALID_TRANSITION", async () => {
    mockEventoFindFirst.mockResolvedValue({ id: "ev-1", estado: "CERRADO" })

    await expect(transicionarEstado("org-1", "ev-1", "ACTIVO", "user-1")).rejects.toMatchObject({ code: "INVALID_TRANSITION" })
  })

  it("PUBLICADO (terminal) lanza INVALID_TRANSITION", async () => {
    mockEventoFindFirst.mockResolvedValue({ id: "ev-1", estado: "PUBLICADO" })

    await expect(transicionarEstado("org-1", "ev-1", "CERRADO", "user-1")).rejects.toMatchObject({ code: "INVALID_TRANSITION" })
  })
})

// ─── addActividad ─────────────────────────────────────────────────────────────

describe("addActividad", () => {
  it("agrega actividad y retorna id", async () => {
    mockEventoFindFirst.mockResolvedValue({ id: "ev-1", estado: "BORRADOR" })
    mockActividadAggregate.mockResolvedValue({ _max: { orden: 0 } })
    mockActividadCreate.mockResolvedValue({ id: "act-1" })

    const result = await addActividad("org-1", "ev-1", { nombre: "Test", tipo: "COMPETICION", pesoRelativo: new Decimal("50") }, "user-1")

    expect(result.id).toBe("act-1")
    expect(mockActividadCreate.mock.calls[0][0].data.orden).toBe(1)
  })
})

// ─── updateActividad ──────────────────────────────────────────────────────────

describe("updateActividad", () => {
  it("actualiza y retorna el registro", async () => {
    mockEventoFindFirst.mockResolvedValue({ id: "ev-1", estado: "BORRADOR" })
    mockActividadFindFirst.mockResolvedValue({ id: "act-1", eventoId: "ev-1" })
    const updated = { id: "act-1", nombre: "Nuevo", descripcion: null, tipo: "CONSTRUCCION", pesoRelativo: new Decimal("30"), orden: 1 }
    mockActividadUpdate.mockResolvedValue(updated)

    const result = await updateActividad("org-1", "ev-1", "act-1", { nombre: "Nuevo", tipo: "CONSTRUCCION", pesoRelativo: new Decimal("30") }, "user-1")

    expect(result.nombre).toBe("Nuevo")
  })

  it("lanza ACTIVIDAD_NO_ENCONTRADA si no existe", async () => {
    mockEventoFindFirst.mockResolvedValue({ id: "ev-1", estado: "BORRADOR" })
    mockActividadFindFirst.mockResolvedValue(null)

    await expect(
      updateActividad("org-1", "ev-1", "no-existe", { nombre: "X", tipo: "COCINA", pesoRelativo: new Decimal("10") }, "user-1"),
    ).rejects.toMatchObject({ code: "ACTIVIDAD_NO_ENCONTRADA" })
  })
})

// ─── deleteActividad ──────────────────────────────────────────────────────────

describe("deleteActividad", () => {
  it("elimina y renumera restantes", async () => {
    mockEventoFindFirst.mockResolvedValue({ id: "ev-1", estado: "BORRADOR" })
    mockActividadFindFirst.mockResolvedValue({ id: "act-1", eventoId: "ev-1", nombre: "Act 1" })
    mockActividadDelete.mockResolvedValue({})
    mockActividadFindMany.mockResolvedValue([{ id: "act-2", orden: 2 }, { id: "act-3", orden: 3 }])
    mockActividadUpdate.mockResolvedValue({})

    await deleteActividad("org-1", "ev-1", "act-1", "user-1")

    expect(mockActividadDelete).toHaveBeenCalledOnce()
    expect(mockActividadUpdate).toHaveBeenCalledTimes(2)
  })
})

// ─── reorderActividad ─────────────────────────────────────────────────────────

describe("reorderActividad", () => {
  it("swapea orden sin violar unique (3 pasos)", async () => {
    mockEventoFindFirst.mockResolvedValue({
      id: "ev-1",
      estado: "BORRADOR",
      actividades: [{ id: "a1", orden: 1 }, { id: "a2", orden: 2 }, { id: "a3", orden: 3 }],
    })
    mockActividadUpdate.mockResolvedValue({})

    await reorderActividad("org-1", "ev-1", "a1", "down", "user-1")

    const calls = mockActividadUpdate.mock.calls
    expect(calls[0][0].data.orden).toBe(-1)
    expect(calls[1][0].data.orden).toBe(1)
    expect(calls[2][0].data.orden).toBe(2)
  })

  it("no hace nada si ya es primera y direction=up", async () => {
    mockEventoFindFirst.mockResolvedValue({
      id: "ev-1",
      estado: "BORRADOR",
      actividades: [{ id: "a1", orden: 1 }, { id: "a2", orden: 2 }],
    })

    await reorderActividad("org-1", "ev-1", "a1", "up", "user-1")

    expect(mockActividadUpdate).not.toHaveBeenCalled()
  })
})

// ─── isEventoLocked ───────────────────────────────────────────────────────────

describe("isEventoLocked", () => {
  it("retorna false en Plan 6a (sin Posta)", async () => {
    expect(await isEventoLocked("ev-1")).toBe(false)
  })
})

// ─── countEventosActivos ──────────────────────────────────────────────────────

describe("countEventosActivos", () => {
  it("filtra por estado ACTIVO", async () => {
    mockEventoCount.mockResolvedValue(3)

    const result = await countEventosActivos("org-1")

    expect(result).toBe(3)
    expect(mockEventoCount).toHaveBeenCalledWith({ where: { organizationId: "org-1", estado: "ACTIVO" } })
  })
})
