import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Mocks ────────────────────────────────────────────────────────────────────

const {
  mockPostaFindFirst,
  mockPostaUpdate,
  mockAuditLogCreate,
  mockTransaction,
  mockRevalidateTag,
} = vi.hoisted(() => ({
  mockPostaFindFirst: vi.fn(),
  mockPostaUpdate:    vi.fn(),
  mockAuditLogCreate: vi.fn(),
  mockTransaction:    vi.fn(),
  mockRevalidateTag:  vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  prisma: {
    posta: { findFirst: mockPostaFindFirst, update: mockPostaUpdate },
    auditLog: { create: mockAuditLogCreate },
    $transaction: mockTransaction,
  },
}))

vi.mock("next/cache", () => ({
  unstable_cache: (_fn: () => unknown) => _fn,
  revalidateTag: mockRevalidateTag,
}))

vi.mock("./evento.repo", () => ({
  isEventoLocked: vi.fn().mockResolvedValue(false),
}))

import { updateCriteriosDescripciones } from "./posta.repo"

beforeEach(() => {
  vi.clearAllMocks()
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      posta: { update: mockPostaUpdate },
      auditLog: { create: mockAuditLogCreate },
    }
    return fn(tx)
  })
})

describe("updateCriteriosDescripciones", () => {
  it("lanza POSTA_NO_ENCONTRADA si la posta no pertenece a la org", async () => {
    mockPostaFindFirst.mockResolvedValue(null)

    await expect(
      updateCriteriosDescripciones("org-1", "posta-x", { criterioId: "crit-1" }, { "5": "texto" }, "user-1"),
    ).rejects.toMatchObject({ code: "POSTA_NO_ENCONTRADA" })
  })

  it("guarda la leyenda de un criterio nuevo en un JSON vacío", async () => {
    mockPostaFindFirst.mockResolvedValue({ id: "posta-1", criteriosDescripciones: {} })
    mockPostaUpdate.mockResolvedValue({})

    await updateCriteriosDescripciones(
      "org-1", "posta-1", { criterioId: "crit-1" }, { "5": "tercero", "10": "primero" }, "user-1",
    )

    const data = mockPostaUpdate.mock.calls[0][0].data
    expect(data.criteriosDescripciones).toEqual({
      criterios: { "crit-1": { "5": "tercero", "10": "primero" } },
    })
  })

  it("invalida tanto postas:orgId como eventos:orgId (findEventoById también lee criteriosDescripciones)", async () => {
    mockPostaFindFirst.mockResolvedValue({ id: "posta-1", criteriosDescripciones: {} })
    mockPostaUpdate.mockResolvedValue({})

    await updateCriteriosDescripciones(
      "org-1", "posta-1", { criterioId: "crit-1" }, { "5": "texto" }, "user-1",
    )

    const tagsInvalidados = mockRevalidateTag.mock.calls.map((c) => c[0])
    expect(tagsInvalidados).toContain("postas:org-1")
    expect(tagsInvalidados).toContain("eventos:org-1")
  })

  it("merge-patch: agregar un criterio no pisa la leyenda de otro criterio ya guardado", async () => {
    mockPostaFindFirst.mockResolvedValue({
      id: "posta-1",
      criteriosDescripciones: { criterios: { "crit-1": { "5": "existente" } } },
    })
    mockPostaUpdate.mockResolvedValue({})

    await updateCriteriosDescripciones(
      "org-1", "posta-1", { criterioId: "crit-2" }, { "5": "nuevo" }, "user-1",
    )

    const data = mockPostaUpdate.mock.calls[0][0].data
    expect(data.criteriosDescripciones).toEqual({
      criterios: {
        "crit-1": { "5": "existente" },
        "crit-2": { "5": "nuevo" },
      },
    })
  })

  it("scope unico no pisa las leyendas de criterios existentes", async () => {
    mockPostaFindFirst.mockResolvedValue({
      id: "posta-1",
      criteriosDescripciones: { criterios: { "crit-1": { "5": "existente" } } },
    })
    mockPostaUpdate.mockResolvedValue({})

    await updateCriteriosDescripciones(
      "org-1", "posta-1", { unico: true }, { "100": "primero" }, "user-1",
    )

    const data = mockPostaUpdate.mock.calls[0][0].data
    expect(data.criteriosDescripciones).toEqual({
      criterios: { "crit-1": { "5": "existente" } },
      unico: { "100": "primero" },
    })
  })

  it("guardar de nuevo el mismo criterio reemplaza su leyenda completa (no hace merge por valor)", async () => {
    mockPostaFindFirst.mockResolvedValue({
      id: "posta-1",
      criteriosDescripciones: { criterios: { "crit-1": { "5": "viejo", "10": "viejo-10" } } },
    })
    mockPostaUpdate.mockResolvedValue({})

    await updateCriteriosDescripciones(
      "org-1", "posta-1", { criterioId: "crit-1" }, { "5": "nuevo" }, "user-1",
    )

    const data = mockPostaUpdate.mock.calls[0][0].data
    expect(data.criteriosDescripciones).toEqual({
      criterios: { "crit-1": { "5": "nuevo" } },
    })
  })
})
