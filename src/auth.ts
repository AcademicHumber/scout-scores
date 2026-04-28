import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/db"
import { aceptarInvitacionEnSignIn } from "@/lib/auth-onboarding"
import { authConfig } from "@/auth.config"

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user }) {
      if (user.id && user.email) {
        await aceptarInvitacionEnSignIn(user.id, user.email)
      }
      return true
    },

    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id!
        const ms = await prisma.membership.findMany({
          where: { userId: user.id! },
          include: {
            organization: { select: { id: true, nombre: true, slug: true } },
          },
        })
        token.memberships = ms.map((m) => ({
          organizationId: m.organizationId,
          organizationNombre: m.organization.nombre,
          organizationSlug: m.organization.slug,
          role: m.role,
          grupoScoutId: m.grupoScoutId,
        }))
        token.activeOrganizationId = ms[0]?.organizationId ?? null
      }

      if (trigger === "update" && session) {
        if (session.activeOrganizationId !== undefined) {
          const valid = (token.memberships ?? []).some(
            (m) => m.organizationId === session.activeOrganizationId,
          )
          if (valid) token.activeOrganizationId = session.activeOrganizationId
        }
        if (session.refreshMemberships) {
          const ms = await prisma.membership.findMany({
            where: { userId: token.id },
            include: {
              organization: { select: { id: true, nombre: true, slug: true } },
            },
          })
          token.memberships = ms.map((m) => ({
            organizationId: m.organizationId,
            organizationNombre: m.organization.nombre,
            organizationSlug: m.organization.slug,
            role: m.role,
            grupoScoutId: m.grupoScoutId,
          }))
          if (!token.activeOrganizationId) {
            token.activeOrganizationId = ms[0]?.organizationId ?? null
          }
        }
      }

      return token
    },

    async session({ session, token }) {
      session.user.id = token.id
      session.user.memberships = token.memberships ?? []
      session.user.activeOrganizationId = token.activeOrganizationId ?? null

      const active = session.user.memberships.find(
        (m) => m.organizationId === session.user.activeOrganizationId,
      )
      session.user.activeRole = active?.role ?? null
      session.user.activeGrupoScoutId = active?.grupoScoutId ?? null
      session.user.activeOrganizationNombre = active?.organizationNombre ?? null

      return session
    },
  },
})
