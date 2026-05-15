import { requireRole } from "@/lib/auth-helpers"
import { listScoreTemplates } from "@/repositories/score-template.repo"
import Link from "next/link"
import { CategoriaSelect } from "@/components/admin/plantillas/CategoriaSelect"
import messages from "@/messages/es.json"
import type { ScoreTemplateModo, ScoreTemplateCategoria } from "@/generated/prisma/enums"

const m = messages.admin.plantillas

type SearchParams = {
  modo?: string
  categoria?: string
  archivadas?: string
}

export default async function PlantillasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const org = await requireRole(["ADMIN"])
  const sp = await searchParams
  const includeArchived = sp.archivadas === "1"

  const all = await listScoreTemplates(org.organizationId, { includeArchived })

  const filtered = all.filter((t) => {
    if (sp.modo && t.modo !== sp.modo) return false
    if (sp.categoria && t.categoria !== sp.categoria) return false
    return true
  })

  const modoTabs: { value: string; label: string }[] = [
    { value: "", label: m.filters.all },
    { value: "CRITERIOS", label: m.filters.criterios },
    { value: "PUNTAJE_UNICO", label: m.filters.puntajeUnico },
  ]

  const categorias: { value: string; label: string }[] = [
    { value: "", label: m.filters.allCategorias },
    { value: "COMPETICION", label: m.categoria.COMPETICION },
    { value: "CONSTRUCCION", label: m.categoria.CONSTRUCCION },
    { value: "COCINA", label: m.categoria.COCINA },
    { value: "OTRO", label: m.categoria.OTRO },
  ]

  function buildUrl(params: Partial<SearchParams>) {
    const next = { ...sp, ...params }
    const qs = Object.entries(next)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${v}`)
      .join("&")
    return qs ? `/admin/plantillas?${qs}` : "/admin/plantillas"
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{m.title}</h1>
          <p className="mt-1 text-sm text-gray-600">{m.subtitle}</p>
        </div>
        <Link
          href="/admin/plantillas/nueva"
          className="shrink-0 whitespace-nowrap rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {m.nuevoCTA}
        </Link>
      </div>

      {/* Filtros */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border bg-white text-sm">
          {modoTabs.map((tab) => (
            <Link
              key={tab.value}
              href={buildUrl({ modo: tab.value || undefined })}
              className={`px-4 py-2 transition-colors ${
                (sp.modo ?? "") === tab.value
                  ? "bg-brand text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <CategoriaSelect value={sp.categoria ?? ""} options={categorias} />

        <Link
          href={buildUrl({ archivadas: includeArchived ? undefined : "1" })}
          className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
            includeArchived
              ? "border-brand bg-brand/10 text-brand"
              : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {m.filters.showArchived}
        </Link>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <p className="py-12 text-center text-gray-500">{m.empty}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <Link
              key={t.id}
              href={`/admin/plantillas/${t.id}`}
              className="group rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-2 flex flex-wrap items-start gap-2">
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                  {m.modo[t.modo as ScoreTemplateModo]}
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {m.categoria[t.categoria as ScoreTemplateCategoria]}
                </span>
                {t.archivedAt && (
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
                    {m.badges.archivada}
                  </span>
                )}
                {t.valoresValidosDesempate.length > 0 && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                    {m.badges.dobleEscala}
                  </span>
                )}
              </div>
              <p className="font-semibold text-gray-900 group-hover:text-brand">{t.nombre}</p>
              {t.descripcion && (
                <p className="mt-1 line-clamp-2 text-sm text-gray-500">{t.descripcion}</p>
              )}
              <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                <span>
                  Escala: {t.valoresValidos.map((v) => v.toString()).join(" / ")}
                </span>
                {t.criterios.length > 0 && (
                  <span>{t.criterios.length} criterio{t.criterios.length !== 1 ? "s" : ""}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
