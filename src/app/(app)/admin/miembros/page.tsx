import { requireRole } from "@/lib/auth-helpers"
import { listMembershipsWithUsers } from "@/repositories/membership.repo"
import { listGrupos } from "@/repositories/grupo.repo"
import { MembershipRow } from "@/components/admin/MembershipRow"
import messages from "@/messages/es.json"

export default async function MiembrosPage() {
  const org = await requireRole(["ADMIN"])

  const [memberships, grupos] = await Promise.all([
    listMembershipsWithUsers(org.organizationId),
    listGrupos(org.organizationId),
  ])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">{messages.admin.miembros.title}</h1>

      <div className="divide-y overflow-hidden rounded-xl border bg-white shadow-sm">
        {memberships.map((m) => (
          <MembershipRow
            key={m.id}
            membership={m}
            grupos={grupos}
            currentUserId={org.userId}
          />
        ))}
      </div>
    </div>
  )
}
