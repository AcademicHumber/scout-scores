import { requireRole } from "@/lib/auth-helpers"
import { countGrupos } from "@/repositories/grupo.repo"
import { countMemberships } from "@/repositories/membership.repo"
import { markInvitationsExpired, countPendingInvitations } from "@/repositories/invitation.repo"
import { countScoreTemplates } from "@/repositories/score-template.repo"
import Link from "next/link"
import messages from "@/messages/es.json"

export default async function AdminPage() {
  const org = await requireRole(["ADMIN"])
  await markInvitationsExpired(org.organizationId)

  const [grupos, miembros, invsPendientes, plantillas] = await Promise.all([
    countGrupos(org.organizationId),
    countMemberships(org.organizationId),
    countPendingInvitations(org.organizationId),
    countScoreTemplates(org.organizationId, { activeOnly: true }),
  ])

  const cards = [
    {
      href: "/admin/distrito",
      title: messages.admin.nav.distrito,
      value: org.nombre,
      isText: true,
    },
    {
      href: "/admin/grupos",
      title: messages.admin.nav.grupos,
      value: String(grupos),
      isText: false,
    },
    {
      href: "/admin/invitaciones",
      title: messages.admin.nav.invitaciones,
      value: String(invsPendientes),
      isText: false,
    },
    {
      href: "/admin/miembros",
      title: messages.admin.nav.miembros,
      value: String(miembros),
      isText: false,
    },
    {
      href: "/admin/plantillas",
      title: messages.admin.nav.plantillas,
      value: String(plantillas),
      isText: false,
    },
  ]

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-gray-900">
        {messages.admin.landing.title}
      </h1>
      <p className="mb-6 text-gray-600">
        {messages.admin.landing.subtitle.replace("{{nombreDistrito}}", org.nombre)}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <p className="text-sm font-medium text-gray-500">{card.title}</p>
            {card.isText ? (
              <p className="mt-1 truncate text-lg font-semibold text-gray-900">{card.value}</p>
            ) : (
              <p className="mt-1 text-3xl font-bold text-brand">{card.value}</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
