import { requireRole } from "@/lib/auth-helpers"
import Link from "next/link"
import { PostaForm } from "@/components/admin/postas/PostaForm"
import messages from "@/messages/es.json"

const m = messages.admin.postas

export default async function NuevaPostaPage() {
  await requireRole(["ADMIN"])

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/admin/postas" className="text-sm text-gray-500 hover:text-gray-700">
          ← {m.title}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{m.nueva}</h1>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <PostaForm />
      </div>
    </div>
  )
}
