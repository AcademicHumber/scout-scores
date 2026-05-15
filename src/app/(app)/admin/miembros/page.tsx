import { requireRole } from "@/lib/auth-helpers"
import { listMembershipsWithUsers } from "@/repositories/membership.repo"
import { listGrupos } from "@/repositories/grupo.repo"
import { MiembrosFilterPanel } from "@/components/admin/MiembrosFilterPanel"
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

      <MiembrosFilterPanel
        memberships={memberships}
        grupos={grupos}
        currentUserId={org.userId}
      />
    </div>
  )
}
