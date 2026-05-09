import { notFound } from "next/navigation"
import { requireRole } from "@/lib/auth-helpers"
import { listPostasParaJuez } from "@/repositories/score-sheet.repo"
import { Breadcrumb } from "@/components/juez/Breadcrumb"
import messages from "@/messages/es.json"

const t = messages.juez

export default async function JuezEventoPage({
  params,
}: {
  params: Promise<{ eventoId: string }>
}) {
  const { eventoId } = await params
  const org = await requireRole(["JUEZ", "ADMIN"])
  const ctx = await listPostasParaJuez(org.organizationId, eventoId, org.userId, org.role === "ADMIN")

  if (!ctx) notFound()

  const { eventoNombre, postas } = ctx

  return (
    <div>
      <Breadcrumb items={[{ label: t.eventos.title, href: "/juez/eventos" }]} />

      <h1 className="text-2xl font-bold text-gray-900 mb-1">{eventoNombre}</h1>
      <p className="text-sm text-gray-500 mb-6">{t.evento.postasTitle}</p>

      {postas.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
          <p className="font-medium text-gray-500">{t.evento.empty}</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {postas.map((posta) => (
            <li key={posta.asignacionId}>
              <a
                href={`/juez/postas/${posta.asignacionId}`}
                className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-4 min-h-[72px] hover:border-brand/50 hover:shadow-sm active:scale-[0.99] transition-all"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base text-gray-900 truncate">{posta.postaNombre}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{posta.actividadNombre}</p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  <div className="flex items-center gap-2">
                    {posta.plantillaModo && (
                      <span className="rounded-full bg-stone-100 text-stone-600 text-xs px-2 py-0.5">
                        {t.posta.modo[posta.plantillaModo]}
                      </span>
                    )}
                    <span className="text-gray-300 text-xl">›</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-700">
                    {posta.enviadas}/{posta.totalPatrullas}
                    <span className="text-xs font-normal text-gray-400 ml-1">enviadas</span>
                  </span>
                  {posta.borradores > 0 && (
                    <span className="rounded-full bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5">
                      {posta.borradores} borr.
                    </span>
                  )}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
