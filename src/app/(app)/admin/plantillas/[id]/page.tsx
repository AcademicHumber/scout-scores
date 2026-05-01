import { requireRole } from "@/lib/auth-helpers"
import { findScoreTemplateById, isTemplateLocked } from "@/repositories/score-template.repo"
import { notFound } from "next/navigation"
import Link from "next/link"
import { TemplateMetadataForm } from "@/components/admin/plantillas/TemplateMetadataForm"
import { TemplateCoreForm } from "@/components/admin/plantillas/TemplateCoreForm"
import { CriterioRow } from "@/components/admin/plantillas/CriterioRow"
import { AddCriterioForm } from "@/components/admin/plantillas/AddCriterioForm"
import { DeleteTemplateForm } from "@/components/admin/plantillas/DeleteTemplateForm"
import {
  archiveTemplateSimple,
  unarchiveTemplateSimple,
  duplicateTemplateSimple,
} from "@/app/(app)/admin/plantillas/actions"
import messages from "@/messages/es.json"
import type { ScoreTemplateModo, ScoreTemplateCategoria } from "@/generated/prisma/enums"

const m = messages.admin.plantillas

export default async function PlantillaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const org = await requireRole(["ADMIN"])
  const { id } = await params

  const [template, locked] = await Promise.all([
    findScoreTemplateById(org.organizationId, id),
    isTemplateLocked(id),
  ])

  if (!template) notFound()

  const escalaLabel = template.valoresValidos.map((v) => v.toString()).join(" / ")
  const escalaDesempateLabel =
    template.valoresValidosDesempate.length > 0
      ? template.valoresValidosDesempate.map((v) => v.toString()).join(" / ")
      : null

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
              {m.modo[template.modo as ScoreTemplateModo]}
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
              {m.categoria[template.categoria as ScoreTemplateCategoria]}
            </span>
            {template.valoresValidosDesempate.length > 0 && (
              <span className="rounded-full bg-purple-100 px-3 py-1 text-xs text-purple-700">
                {m.badges.dobleEscala}
              </span>
            )}
            {template.archivedAt && (
              <span className="rounded-full bg-orange-100 px-3 py-1 text-xs text-orange-700">
                {m.badges.archivada}
              </span>
            )}
            {locked && (
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-700">En uso</span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{template.nombre}</h1>
          <Link href="/admin/plantillas" className="mt-1 text-sm text-gray-500 hover:text-brand">
            ← {m.title}
          </Link>
        </div>

        {/* Acciones laterales */}
        <div className="flex flex-col gap-2">
          <form action={duplicateTemplateSimple}>
            <input type="hidden" name="id" value={template.id} />
            <button type="submit" className="w-full rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              {m.detail.duplicateButton}
            </button>
          </form>

          {template.archivedAt ? (
            <form action={unarchiveTemplateSimple}>
              <input type="hidden" name="id" value={template.id} />
              <button type="submit" className="w-full rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                {m.detail.unarchiveButton}
              </button>
            </form>
          ) : (
            <form action={archiveTemplateSimple}>
              <input type="hidden" name="id" value={template.id} />
              <button type="submit" className="w-full rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                {m.detail.archiveButton}
              </button>
            </form>
          )}

          <DeleteTemplateForm id={template.id} nombre={template.nombre} />
        </div>
      </div>

      {/* Sección metadata */}
      <section className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">{m.detail.metadataTitle}</h2>
        <TemplateMetadataForm
          template={{
            id: template.id,
            nombre: template.nombre,
            descripcion: template.descripcion,
            categoria: template.categoria,
          }}
        />
      </section>

      {/* Sección configuración de puntaje */}
      <section className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">{m.detail.coreTitle}</h2>
        {escalaDesempateLabel && (
          <div className="mb-4 flex flex-wrap gap-4 text-sm text-gray-600">
            <span>
              <span className="font-medium">{m.detail.escalaLabel}:</span> {escalaLabel}
            </span>
            <span>
              <span className="font-medium">{m.detail.escalaDesempateLabel}:</span> {escalaDesempateLabel}
            </span>
          </div>
        )}
        <TemplateCoreForm
          template={{
            id: template.id,
            modo: template.modo,
            valoresValidos: template.valoresValidos.map((v) => v.toString()),
            valoresValidosDesempate: template.valoresValidosDesempate.map((v) => v.toString()),
          }}
          locked={locked}
        />
      </section>

      {/* Sección criterios */}
      <section className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          {template.modo === "PUNTAJE_UNICO" ? m.detail.criteriosDesempateTitle : m.detail.criteriosTitle}
        </h2>

        {template.criterios.length === 0 ? (
          <p className="mb-4 text-sm text-gray-400">
            {template.modo === "PUNTAJE_UNICO"
              ? "No hay criterios de desempate. Podés agregar algunos a continuación."
              : "No hay criterios. Agregá el primero abajo."}
          </p>
        ) : (
          <div className="mb-4 space-y-3">
            {template.criterios.map((c) => (
              <CriterioRow
                key={c.id}
                templateId={template.id}
                criterio={{
                  id: c.id,
                  nombre: c.nombre,
                  descripcion: c.descripcion,
                  tipo: c.tipo,
                  orden: c.orden,
                }}
                totalCriterios={template.criterios.length}
                modo={template.modo}
                locked={locked}
                escalaLabel={escalaLabel}
                escalaDesempateLabel={
                  template.valoresValidosDesempate.length > 0 ? escalaDesempateLabel : null
                }
              />
            ))}
          </div>
        )}

        <AddCriterioForm templateId={template.id} modo={template.modo} locked={locked} />
      </section>
    </div>
  )
}
