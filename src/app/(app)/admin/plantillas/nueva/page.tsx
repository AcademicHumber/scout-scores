import { requireRole } from "@/lib/auth-helpers"
import { TemplateForm } from "@/components/admin/plantillas/TemplateForm"
import messages from "@/messages/es.json"

export default async function NuevaPlantillaPage() {
  await requireRole(["ADMIN"])
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{messages.admin.plantillas.newButton}</h1>
      <TemplateForm />
    </div>
  )
}
