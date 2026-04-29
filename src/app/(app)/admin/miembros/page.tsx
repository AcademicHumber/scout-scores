import { requireRole } from "@/lib/auth-helpers"
import { forOrg, prisma } from "@/lib/db"
import { MembershipRow } from "@/components/admin/MembershipRow"
import messages from "@/messages/es.json"

export default async function MiembrosPage() {
  const org = await requireRole(["ADMIN"])
  const repo = forOrg(org.organizationId)

  const [memberships, grupos] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: org.organizationId },
      include: {
        user: { select: { name: true, email: true, image: true } },
        grupoScout: { select: { nombre: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    repo.grupoScout.findMany({ orderBy: { nombre: "asc" } }),
  ])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">{messages.admin.miembros.title}</h1>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-700">
                {messages.admin.miembros.columns.nombre}
              </th>
              <th className="px-4 py-3 font-medium text-gray-700">
                {messages.admin.miembros.columns.role} / {messages.admin.miembros.columns.grupo}
              </th>
              <th className="px-4 py-3 font-medium text-gray-700">
                {messages.admin.miembros.columns.acciones}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {memberships.map((m) => (
              <MembershipRow
                key={m.id}
                membership={m}
                grupos={grupos}
                currentUserId={org.userId}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
