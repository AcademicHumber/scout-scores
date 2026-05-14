import { requireRole } from "@/lib/auth-helpers"
import { TemplateForm } from "@/components/admin/plantillas/TemplateForm"
import Link from "next/link"
import messages from "@/messages/es.json"

const m = messages.admin.plantillas

export default async function NuevaPlantillaPage() {
  await requireRole(["ADMIN"])
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/admin/plantillas" className="text-sm text-gray-500 hover:text-brand">
          ← {m.title}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{m.newButton}</h1>
      </div>
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <TemplateForm />
      </div>
    </div>
  )
}
