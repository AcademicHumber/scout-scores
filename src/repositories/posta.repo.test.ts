import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Mocks ────────────────────────────────────────────────────────────────────

const {
  mockPostaFindFirst,
  mockPostaUpdate,
  mockPostaCreate,
  mockPostaDelete,
  mockAsignacionPostaCreate,
  mockAsignacionPostaFindFirst,
  mockAsignacionPostaFindMany,
  mockAsignacionPostaAggregate,
  mockActividadFindFirst,
  mockMembershipFindFirst,
  mockAuditLogCreate,
  mockTransaction,
  mockRevalidateTag,
} = vi.hoisted(() => ({
  mockPostaFindFirst:          vi.fn(),
  mockPostaUpdate:             vi.fn(),
  mockPostaCreate:             vi.fn(),
  mockPostaDelete:             vi.fn(),
  mockAsignacionPostaCreate:   vi.fn(),
  mockAsignacionPostaFindFirst: vi.fn(),
  mockAsignacionPostaFindMany: vi.fn(),
  mockAsignacionPostaAggregate: vi.fn(),
  mockActividadFindFirst:      vi.fn(),
  mockMembershipFindFirst:     vi.fn(),
  mockAuditLogCreate:          vi.fn(),
  mockTransaction:             vi.fn(),
  mockRevalidateTag:           vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  prisma: {
    posta: {
      findFirst: mockPostaFindFirst,
      update: mockPostaUpdate,
      create: mockPostaCreate,
      delete: mockPostaDelete,
    },
    asignacionPosta: {
      create: mockAsignacionPostaCreate,
      findFirst: mockAsignacionPostaFindFirst,
      findMany: mockAsignacionPostaFindMany,
      aggregate: mockAsignacionPostaAggregate,
    },
    actividad: { findFirst: mockActividadFindFirst },
    membership: { findFirst: mockMembershipFindFirst },
    auditLog: { create: mockAuditLogCreate },
    $transaction: mockTransaction,
  },
}))

vi.mock("next/cache", () => ({
  unstable_cache: (_fn: () => unknown) => _fn,
  revalidateTag: mockRevalidateTag,
}))

vi.mock("./evento.repo", () => ({
  isEventoLocked: vi.fn(),
}))

import { isEventoLocked } from "./evento.repo"
import {
  updateCriteriosDescripciones,
  crearPostaYAsignar,
  updatePosta,
  deletePosta,
  asignarPosta,
} from "./posta.repo"

function makeTx() {
  return {
    posta: { create: mockPostaCreate, update: mockPostaUpdate, delete: mockPostaDelete },
    asignacionPosta: { create: mockAsignacionPostaCreate },
    auditLog: { create: mockAuditLogCreate },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isEventoLocked).mockResolvedValue(false)
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(makeTx()))
})

describe("updateCriteriosDescripciones", () => {
  it("lanza POSTA_NO_ENCONTRADA si la posta no pertenece a la org", async () => {
    mockPostaFindFirst.mockResolvedValue(null)

    await expect(
      updateCriteriosDescripciones(
        "org-1", "posta-x", { criterioId: "crit-1" }, { "5": "texto" }, "user-1", "ADMIN",
      ),
    ).rejects.toMatchObject({ code: "POSTA_NO_ENCONTRADA" })
  })

  it("lanza POSTA_NO_PROPIA si un JUEZ intenta editar la leyenda de la posta de otro", async () => {
    mockPostaFindFirst.mockResolvedValue({
      id: "posta-1", criteriosDescripciones: {}, creadoPorUserId: "user-otro",
    })

    await expect(
      updateCriteriosDescripciones(
        "org-1", "posta-1", { criterioId: "crit-1" }, { "5": "texto" }, "user-1", "JUEZ",
      ),
    ).rejects.toMatchObject({ code: "POSTA_NO_PROPIA" })
  })

  it("permite a un JUEZ editar la leyenda de su propia posta", async () => {
    mockPostaFindFirst.mockResolvedValue({
      id: "posta-1", criteriosDescripciones: {}, creadoPorUserId: "user-1",
    })
    mockPostaUpdate.mockResolvedValue({})

    await expect(
      updateCriteriosDescripciones(
        "org-1", "posta-1", { criterioId: "crit-1" }, { "5": "texto" }, "user-1", "JUEZ",
      ),
    ).resolves.toBeUndefined()
  })

  it("guarda la leyenda de un criterio nuevo en un JSON vacío", async () => {
    mockPostaFindFirst.mockResolvedValue({ id: "posta-1", criteriosDescripciones: {} })
    mockPostaUpdate.mockResolvedValue({})

    await updateCriteriosDescripciones(
      "org-1", "posta-1", { criterioId: "crit-1" }, { "5": "tercero", "10": "primero" }, "user-1", "ADMIN",
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
      "org-1", "posta-1", { criterioId: "crit-1" }, { "5": "texto" }, "user-1", "ADMIN",
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
      "org-1", "posta-1", { criterioId: "crit-2" }, { "5": "nuevo" }, "user-1", "ADMIN",
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
      "org-1", "posta-1", { unico: true }, { "100": "primero" }, "user-1", "ADMIN",
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
      "org-1", "posta-1", { criterioId: "crit-1" }, { "5": "nuevo" }, "user-1", "ADMIN",
    )

    const data = mockPostaUpdate.mock.calls[0][0].data
    expect(data.criteriosDescripciones).toEqual({
      criterios: { "crit-1": { "5": "nuevo" } },
    })
  })
})

describe("crearPostaYAsignar", () => {
  const data = {
    nombre: "Nudos y amarres",
    descripcion: "Armar una torre",
    criteriosDescripciones: { unico: { "10": "primero" } },
  }

  it("crea la posta y la asignación en una única transacción, con creadoPorUserId y la leyenda inicial", async () => {
    mockActividadFindFirst.mockResolvedValue({ eventoId: "evento-1" })
    mockAsignacionPostaAggregate.mockResolvedValue({ _max: { orden: null } })
    mockPostaCreate.mockResolvedValue({ id: "posta-1", nombre: data.nombre })
    mockAsignacionPostaCreate.mockResolvedValue({ id: "asig-1" })

    const result = await crearPostaYAsignar("org-1", "actividad-1", data, "user-juez")

    expect(result).toEqual({ postaId: "posta-1", asignacionId: "asig-1" })
    expect(mockTransaction).toHaveBeenCalledTimes(1)

    const postaCreateArgs = mockPostaCreate.mock.calls[0][0].data
    expect(postaCreateArgs.creadoPorUserId).toBe("user-juez")
    expect(postaCreateArgs.criteriosDescripciones).toEqual(data.criteriosDescripciones)

    const asignacionCreateArgs = mockAsignacionPostaCreate.mock.calls[0][0].data
    expect(asignacionCreateArgs).toMatchObject({
      postaId: "posta-1",
      actividadId: "actividad-1",
      juezUserId: "user-juez",
    })

    // Ambos audit logs registran el origen "juez"
    const audits = mockAuditLogCreate.mock.calls.map((c) => c[0].data)
    expect(audits).toHaveLength(2)
    expect(audits.every((a) => a.metadata.origen === "juez")).toBe(true)

    const tagsInvalidados = mockRevalidateTag.mock.calls.map((c) => c[0])
    expect(tagsInvalidados).toContain("postas:org-1")
    expect(tagsInvalidados).toContain("eventos:org-1")
  })

  it("si la asignación falla dentro de la transacción, la operación entera rechaza (no queda posta huérfana)", async () => {
    mockActividadFindFirst.mockResolvedValue({ eventoId: "evento-1" })
    mockAsignacionPostaAggregate.mockResolvedValue({ _max: { orden: null } })
    mockPostaCreate.mockResolvedValue({ id: "posta-1", nombre: data.nombre })
    mockAsignacionPostaCreate.mockRejectedValue(new Error("fallo inesperado"))

    await expect(crearPostaYAsignar("org-1", "actividad-1", data, "user-juez")).rejects.toThrow(
      "fallo inesperado",
    )

    // La posta se intentó crear dentro de la misma transacción que la asignación:
    // en Prisma real, el rechazo de la transacción revierte también ese create.
    expect(mockPostaCreate).toHaveBeenCalledTimes(1)
    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })

  it("ACTIVIDAD_NO_ENCONTRADA si la actividad no pertenece a la org", async () => {
    mockActividadFindFirst.mockResolvedValue(null)

    await expect(crearPostaYAsignar("org-1", "actividad-x", data, "user-juez")).rejects.toMatchObject({
      code: "ACTIVIDAD_NO_ENCONTRADA",
    })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it("EVENTO_LOCKED si el evento ya tiene planillas enviadas", async () => {
    mockActividadFindFirst.mockResolvedValue({ eventoId: "evento-1" })
    vi.mocked(isEventoLocked).mockResolvedValue(true)

    await expect(crearPostaYAsignar("org-1", "actividad-1", data, "user-juez")).rejects.toMatchObject({
      code: "EVENTO_LOCKED",
    })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it("NOMBRE_POSTA_DUPLICADO ante P2002 en la creación (dos jueces creando la misma posta a la vez)", async () => {
    mockActividadFindFirst.mockResolvedValue({ eventoId: "evento-1" })
    mockAsignacionPostaAggregate.mockResolvedValue({ _max: { orden: null } })
    mockTransaction.mockImplementationOnce(async () => {
      throw { code: "P2002" }
    })

    await expect(crearPostaYAsignar("org-1", "actividad-1", data, "user-juez")).rejects.toMatchObject({
      code: "NOMBRE_POSTA_DUPLICADO",
    })
  })
})

describe("updatePosta / deletePosta — ownership por rol", () => {
  it("updatePosta: JUEZ no puede editar una posta creada por otro usuario → POSTA_NO_PROPIA", async () => {
    mockPostaFindFirst.mockResolvedValue({ id: "posta-1", creadoPorUserId: "otro-user" })

    await expect(
      updatePosta("org-1", "posta-1", { nombre: "Nuevo nombre" }, "user-juez", "JUEZ"),
    ).rejects.toMatchObject({ code: "POSTA_NO_PROPIA" })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it("updatePosta: JUEZ puede editar su propia posta", async () => {
    mockPostaFindFirst.mockResolvedValue({ id: "posta-1", creadoPorUserId: "user-juez" })
    mockPostaUpdate.mockResolvedValue({ id: "posta-1", nombre: "Nuevo nombre" })

    await expect(
      updatePosta("org-1", "posta-1", { nombre: "Nuevo nombre" }, "user-juez", "JUEZ"),
    ).resolves.toMatchObject({ id: "posta-1" })
  })

  it("updatePosta: ADMIN puede editar cualquier posta, sea o no la propia", async () => {
    mockPostaFindFirst.mockResolvedValue({ id: "posta-1", creadoPorUserId: "otro-user" })
    mockPostaUpdate.mockResolvedValue({ id: "posta-1", nombre: "Nuevo nombre" })

    await expect(
      updatePosta("org-1", "posta-1", { nombre: "Nuevo nombre" }, "user-admin", "ADMIN"),
    ).resolves.toMatchObject({ id: "posta-1" })
  })

  it("deletePosta: JUEZ no puede borrar una posta creada por otro usuario → POSTA_NO_PROPIA", async () => {
    mockPostaFindFirst.mockResolvedValue({ id: "posta-1", creadoPorUserId: "otro-user", nombre: "X" })

    await expect(deletePosta("org-1", "posta-1", "user-juez", "JUEZ")).rejects.toMatchObject({
      code: "POSTA_NO_PROPIA",
    })
    expect(mockAsignacionPostaFindMany).not.toHaveBeenCalled()
  })

  it("deletePosta: JUEZ puede borrar su propia posta sin asignaciones", async () => {
    mockPostaFindFirst.mockResolvedValue({ id: "posta-1", creadoPorUserId: "user-juez", nombre: "X" })
    mockAsignacionPostaFindMany.mockResolvedValue([])

    await expect(deletePosta("org-1", "posta-1", "user-juez", "JUEZ")).resolves.toBeUndefined()
  })
})

describe("asignarPosta — carrera de asignación", () => {
  const data = { postaId: "posta-1", juezUserId: "user-2" }

  it("P2002 en el create de AsignacionPosta → POSTA_YA_ASIGNADA_EN_EVENTO (no un throw genérico)", async () => {
    mockActividadFindFirst.mockResolvedValue({ eventoId: "evento-1" })
    mockPostaFindFirst.mockResolvedValue({ id: "posta-1" })
    mockAsignacionPostaFindFirst.mockResolvedValue(null) // sin conflicto en el pre-check
    mockMembershipFindFirst.mockResolvedValue({ id: "membership-1" })
    mockAsignacionPostaAggregate.mockResolvedValue({ _max: { orden: 1 } })
    mockTransaction.mockImplementationOnce(async () => {
      throw { code: "P2002" }
    })

    await expect(asignarPosta("org-1", "actividad-1", data, "user-1")).rejects.toMatchObject({
      code: "POSTA_YA_ASIGNADA_EN_EVENTO",
    })
  })
})
