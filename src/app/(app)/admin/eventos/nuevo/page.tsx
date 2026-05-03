import { requireRole } from "@/lib/auth-helpers"
import { EventoCreateForm } from "@/components/admin/eventos/EventoCreateForm"
import Link from "next/link"
import messages from "@/messages/es.json"

const m = messages.admin.eventos

export default async function NuevoEventoPage() {
  await requireRole(["ADMIN"])

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <Link href="/admin/eventos" className="text-sm text-gray-500 hover:text-gray-700">
          ← {m.title}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{m.newButton}</h1>
      </div>
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <EventoCreateForm />
      </div>
    </div>
  )
}
