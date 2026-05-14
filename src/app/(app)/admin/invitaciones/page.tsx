import { requireRole } from "@/lib/auth-helpers"
import { listGrupos } from "@/repositories/grupo.repo"
import { listInvitations } from "@/repositories/invitation.repo"
import { markInvitationsExpired } from "@/repositories/invitation.repo"
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
    listInvitations(org.organizationId),
    listGrupos(org.organizationId),
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
        <InvitationList invitations={pending} showRevoke />
      </Section>

      <Section title={messages.admin.invitaciones.sections.accepted} count={accepted.length}>
        <InvitationList invitations={accepted} />
      </Section>

      <Section title={messages.admin.invitaciones.sections.expired} count={rest.length}>
        <InvitationList invitations={rest} />
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

function InvitationList({
  invitations,
  showRevoke,
}: {
  invitations: InvitationWithGrupo[]
  showRevoke?: boolean
}) {
  return (
    <div className="divide-y overflow-hidden rounded-xl border bg-white shadow-sm">
      {invitations.map((inv) => (
        <div key={inv.id} className="px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <span className="truncate text-sm font-medium text-gray-900">{inv.email}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                inv.status === "PENDING"
                  ? "bg-yellow-100 text-yellow-800"
                  : inv.status === "ACCEPTED"
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-100 text-gray-600"
              }`}
            >
              {STATUS_LABELS[inv.status] ?? inv.status}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            {ROLE_LABELS[inv.role] ?? inv.role}
            {inv.grupoScout ? ` · ${inv.grupoScout.nombre}` : ""}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              Expira {inv.expiresAt.toLocaleDateString("es-AR")}
            </span>
            {showRevoke && <RevokeButton id={inv.id} email={inv.email} />}
          </div>
        </div>
      ))}
    </div>
  )
}
