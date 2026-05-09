import Link from "next/link"
import { requireRole } from "@/lib/auth-helpers"
import { listEventosParaJuez } from "@/repositories/score-sheet.repo"
import messages from "@/messages/es.json"

const t = messages.juez

export default async function JuezEventosPage() {
  const org = await requireRole(["JUEZ", "ADMIN"])
  const eventos = await listEventosParaJuez(org.organizationId, org.userId, org.role === "ADMIN")

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t.eventos.title}</h1>
      <p className="text-sm text-gray-500 mb-6">{t.eventos.subtitle}</p>

      {eventos.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
          <p className="font-medium text-gray-500">{t.eventos.empty}</p>
          <p className="text-sm text-gray-400 mt-1">{t.eventos.emptyHint}</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {eventos.map((evento) => (
            <li key={evento.id}>
              <Link
                href={`/juez/eventos/${evento.id}`}
                className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-4 min-h-[72px] hover:border-brand/50 hover:shadow-sm active:scale-[0.99] transition-all"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base text-gray-900 leading-tight truncate">
                    {evento.nombre}
                  </p>
                  {evento.lugar && (
                    <p className="text-sm text-gray-500 mt-0.5 truncate">{evento.lugar}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(evento.fechaInicio).toLocaleDateString("es-AR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <span className="rounded-full bg-brand-light text-brand text-sm font-semibold px-3 py-1">
                    {evento.postasCount === 1
                      ? t.evento.postasCount.replace("{{count}}", "1")
                      : t.evento.postasCountPlural.replace("{{count}}", String(evento.postasCount))}
                  </span>
                  <span className="text-gray-300 text-xl">›</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
