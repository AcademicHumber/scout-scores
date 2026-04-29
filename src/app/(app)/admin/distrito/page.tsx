import { requireRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/db"
import { DistritoForm } from "./DistritoForm"
import messages from "@/messages/es.json"

export default async function DistritoPage() {
  const org = await requireRole(["ADMIN"])
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: org.organizationId },
    select: { nombre: true, slug: true },
  })

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        {messages.admin.distrito.title}
      </h1>
      <DistritoForm nombre={organization.nombre} slug={organization.slug} />
    </div>
  )
}
