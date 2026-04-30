import { requireRole } from "@/lib/auth-helpers"
import { listGrupos } from "@/repositories/grupo.repo"
import { GrupoCreateForm } from "./GrupoCreateForm"
import Link from "next/link"
import messages from "@/messages/es.json"

export default async function GruposPage() {
  const org = await requireRole(["ADMIN"])
  const grupos = await listGrupos(org.organizationId)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{messages.admin.grupos.title}</h1>

      {grupos.length === 0 ? (
        <p className="text-gray-500">{messages.admin.grupos.empty}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-700">Nombre</th>
                <th className="px-4 py-3 font-medium text-gray-700">Identificador</th>
                <th className="px-4 py-3 font-medium text-gray-700"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {grupos.map((g) => (
                <tr key={g.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{g.nombre}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{g.slug}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/grupos/${g.id}`}
                      className="text-sm font-medium text-brand hover:underline"
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <GrupoCreateForm />
    </div>
  )
}
