import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import { InviteResult } from "@/components/invite/InviteResult"
import { InviteAccepted } from "@/components/invite/InviteAccepted"

interface Props {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params
  const session = await auth()

  if (!session) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`)
  }

  const inv = await prisma.invitation.findUnique({ where: { token } })

  if (!inv || inv.status !== "PENDING" || inv.expiresAt < new Date()) {
    return <InviteResult kind="invalid" />
  }

  if (inv.email.toLowerCase() !== session.user.email!.toLowerCase()) {
    return (
      <InviteResult
        kind="emailMismatch"
        expected={inv.email}
        got={session.user.email!}
      />
    )
  }

  const existing = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: session.user.id,
        organizationId: inv.organizationId,
      },
    },
  })

  if (existing) {
    await prisma.invitation.update({
      where: { id: inv.id },
      data: { status: "ACCEPTED", acceptedAt: existing.createdAt },
    }).catch(() => {})
    // JWT refresh ocurre en el cliente vía InviteAccepted
    return <InviteAccepted />
  }

  await prisma.$transaction(async (tx) => {
    await tx.membership.create({
      data: {
        userId: session.user.id,
        organizationId: inv.organizationId,
        role: inv.role,
        grupoScoutId: inv.grupoScoutId,
      },
    })
    await tx.invitation.update({
      where: { id: inv.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    })
    await tx.auditLog.create({
      data: {
        organizationId: inv.organizationId,
        actorUserId: session.user.id,
        action: "invitation.accepted",
        targetType: "Invitation",
        targetId: inv.id,
        metadata: { role: inv.role, via: "deep-link" },
      },
    })
  })

  // unstable_update no funciona en Server Components — el refresh del JWT
  // ocurre en el cliente vía InviteAccepted (useSession().update)
  return <InviteAccepted />
}
