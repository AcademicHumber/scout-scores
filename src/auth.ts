import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/db"
import { aceptarInvitacionEnSignIn } from "@/lib/auth-onboarding"
import { buildSession } from "@/auth.config"
import {
  signinSchema,
  verifyPassword,
  normalizeEmail,
} from "@/lib/auth-credentials"
import {
  findUserByEmailRaw,
  recordFailedAttempt,
  clearFailedAttempts,
  isLocked,
} from "@/repositories/auth.repo"

const credentialsProvider = Credentials({
  name: "Credenciales",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Contraseña", type: "password" },
  },
  async authorize(raw) {
    const parsed = signinSchema.safeParse(raw)
    if (!parsed.success) return null

    const email = normalizeEmail(parsed.data.email)
    const password = parsed.data.password

    if (await isLocked(email)) return null

    const user = await findUserByEmailRaw(email)
    if (!user?.passwordHash) {
      await recordFailedAttempt(email)
      return null
    }

    const ok = await verifyPassword(password, user.passwordHash)
    if (!ok) {
      await recordFailedAttempt(email)
      return null
    }

    await clearFailedAttempts(email)
    return { id: user.id, email: user.email, name: user.name, image: user.image }
  },
})

// Google con allowDangerousEmailAccountLinking permite vincular automáticamente
// si ya hay un User con ese email (registrado via credentials). Es seguro porque
// Google verifica el email del lado de Google.
const googleProvider = Google({ allowDangerousEmailAccountLinking: true })

export const { auth, handlers, signIn, signOut, unstable_update } = NextAuth({
  providers: [googleProvider, credentialsProvider],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60,
  },
  adapter: PrismaAdapter(prisma),
  callbacks: {

    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id!
        if (user.email) {
          await aceptarInvitacionEnSignIn(user.id!, user.email)
        }
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
      return buildSession(session, token)
    },
  },
})
