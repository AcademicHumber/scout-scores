import { requireRole } from "@/lib/auth-helpers"
import { listPostas } from "@/repositories/posta.repo"
import Link from "next/link"
import messages from "@/messages/es.json"
import { PostasSearchPanel } from "@/components/admin/postas/PostasSearchPanel"

const m = messages.admin.postas

export default async function PostasPage() {
  const org = await requireRole(["ADMIN"])
  const postas = await listPostas(org.organizationId)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{m.title}</h1>
          <p className="mt-1 text-sm text-gray-500 pr-2">{m.subtitle}</p>
        </div>
        <Link
          href="/admin/postas/nueva"
          className="shrink-0 whitespace-nowrap rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
        >
          {m.nuevoCTA}
        </Link>
      </div>

      {postas.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-500">
          {m.empty}
        </div>
      ) : (
        <PostasSearchPanel postas={postas} />
      )}
    </div>
  )
}
