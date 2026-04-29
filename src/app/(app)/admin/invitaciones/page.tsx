import { requireRole } from "@/lib/auth-helpers"
import { forOrg, prisma } from "@/lib/db"
import { markInvitationsExpired } from "@/lib/invitations"
import { NewInvitationForm } from "@/components/admin/NewInvitationForm"
import { RevokeButton } from "./RevokeButton"
import { headers } from "next/headers"
import messages from "@/messages/es.json"
import type { Prisma } from "@/generated/prisma/client"

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  JUEZ: "Juez",
  ESPECTADOR: "Espectador",
  JEFE_PATRULLA: "Jefe de Patrulla",
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  ACCEPTED: "Aceptada",
  REVOKED: "Revocada",
  EXPIRED: "Expirada",
}

type InvitationWithGrupo = Prisma.InvitationGetPayload<{
  include: { grupoScout: { select: { nombre: true } } }
}>

export default async function InvitacionesPage() {
  const org = await requireRole(["ADMIN"])
  await markInvitationsExpired(org.organizationId)

  const [invitations, grupos, headersList] = await Promise.all([
    prisma.invitation.findMany({
      where: { organizationId: org.organizationId },
      include: { grupoScout: { select: { nombre: true } } },
      orderBy: { createdAt: "desc" },
    }),
    forOrg(org.organizationId).grupoScout.findMany({ orderBy: { nombre: "asc" } }),
    headers(),
  ])

  const host = headersList.get("host") ?? "localhost:3000"
  const protocol = host.startsWith("localhost") ? "http" : "https"
  const appUrl = `${protocol}://${host}`

  const pending = invitations.filter((i) => i.status === "PENDING")
  const accepted = invitations.filter((i) => i.status === "ACCEPTED")
  const rest = invitations.filter((i) => i.status === "REVOKED" || i.status === "EXPIRED")

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{messages.admin.invitaciones.title}</h1>

      <NewInvitationForm grupos={grupos} appUrl={appUrl} />

      <Section title={messages.admin.invitaciones.sections.pending} count={pending.length}>
        <InvitationTable invitations={pending} showRevoke />
      </Section>

      <Section title={messages.admin.invitaciones.sections.accepted} count={accepted.length}>
        <InvitationTable invitations={accepted} />
      </Section>

      <Section title={messages.admin.invitaciones.sections.expired} count={rest.length}>
        <InvitationTable invitations={rest} />
      </Section>
    </div>
  )
}

function Section({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {title} ({count})
      </h2>
      {count === 0 ? (
        <p className="text-sm text-gray-400">Sin resultados</p>
      ) : (
        children
      )}
    </div>
  )
}

function InvitationTable({
  invitations,
  showRevoke,
}: {
  invitations: InvitationWithGrupo[]
  showRevoke?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="px-4 py-3 font-medium text-gray-700">Email</th>
            <th className="px-4 py-3 font-medium text-gray-700">Rol</th>
            <th className="px-4 py-3 font-medium text-gray-700">Grupo</th>
            <th className="px-4 py-3 font-medium text-gray-700">Estado</th>
            <th className="px-4 py-3 font-medium text-gray-700">Expira</th>
            {showRevoke && <th className="px-4 py-3"></th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {invitations.map((inv) => (
            <tr key={inv.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-900">{inv.email}</td>
              <td className="px-4 py-3 text-gray-600">{ROLE_LABELS[inv.role] ?? inv.role}</td>
              <td className="px-4 py-3 text-gray-500">{inv.grupoScout?.nombre ?? "—"}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    inv.status === "PENDING"
                      ? "bg-yellow-100 text-yellow-800"
                      : inv.status === "ACCEPTED"
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {STATUS_LABELS[inv.status] ?? inv.status}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-gray-500">
                {inv.expiresAt.toLocaleDateString("es-AR")}
              </td>
              {showRevoke && (
                <td className="px-4 py-3 text-right">
                  <RevokeButton id={inv.id} email={inv.email} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
