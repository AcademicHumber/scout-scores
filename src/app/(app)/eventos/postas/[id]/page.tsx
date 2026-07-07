import { requireRole } from "@/lib/auth-helpers"
import { findPostaById } from "@/repositories/posta.repo"
import { notFound } from "next/navigation"
import Link from "next/link"
import { PostaDetailForm } from "@/components/admin/postas/PostaDetailForm"
import { CriteriosDescripcionesForm } from "@/components/admin/postas/CriteriosDescripcionesForm"
import {
  updatePostaComoJuezAction,
  deletePostaComoJuezAction,
  updateCriteriosDescripcionesComoJuezAction,
} from "../actions"
import messages from "@/messages/es.json"

const m = messages.eventos.misPostas

export default async function MiPostaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ volver?: string }>
}) {
  const org = await requireRole(["JUEZ", "ADMIN"])
  const { id } = await params
  const { volver } = await searchParams
  const volverHref = volver && volver.startsWith("/") && !volver.startsWith("//") ? volver : "/eventos/postas"

  const posta = await findPostaById(org.organizationId, id)
  if (!posta) notFound()
  if (org.role !== "ADMIN" && posta.creadoPorUserId !== org.userId) notFound()

  const materiales = Array.isArray(posta.materiales)
    ? (posta.materiales as Array<{ nombre: string; cantidad?: string }>)
    : []

  const templatesVistos = new Set<string>()
  const templates = []
  for (const asig of posta.asignaciones) {
    const template = asig.actividad.template
    if (!template || templatesVistos.has(template.id)) continue
    templatesVistos.add(template.id)
    templates.push({
      id: template.id,
      nombre: template.nombre,
      modo: template.modo,
      valoresValidos: template.valoresValidos.map(Number),
      valoresValidosDesempate: template.valoresValidosDesempate.map(Number),
      criterios: template.criterios.map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo })),
    })
  }

  const criteriosDescripciones = (posta.criteriosDescripciones ?? {}) as {
    criterios?: Record<string, Record<string, string>>
    unico?: Record<string, string>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <div>
        <Link href={volverHref} className="text-sm text-gray-500 hover:text-gray-700">
          {volverHref === "/eventos/postas" ? m.volver : m.volverGenerico}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{posta.nombre}</h1>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <PostaDetailForm
          posta={{
            id: posta.id,
            nombre: posta.nombre,
            descripcion: posta.descripcion,
            duracionMinutos: posta.duracionMinutos,
            materiales,
            asignacionesCount: posta.asignaciones.length,
          }}
          updateAction={updatePostaComoJuezAction}
          deleteAction={deletePostaComoJuezAction}
        />
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Leyenda de puntajes</h2>
        <p className="mb-4 text-sm text-gray-500">
          Qué significa cada puntaje posible para esta posta (ej: &quot;10 = llegó primero&quot;). Se muestra al juez al cargar la planilla.
        </p>
        <CriteriosDescripcionesForm
          mode="persist"
          postaId={posta.id}
          templates={templates}
          criteriosDescripciones={criteriosDescripciones}
          updateAction={updateCriteriosDescripcionesComoJuezAction}
        />
      </div>
    </div>
  )
}
