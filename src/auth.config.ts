import type { NextAuthConfig, Session } from "next-auth"
import type { JWT } from "next-auth/jwt"
import Google from "next-auth/providers/google"

const PUBLIC_PATHS = ["/login", "/registro", "/api/auth", "/api/health", "/invite", "/resultados"]
const ONBOARDING_PATH = "/onboarding"

export function buildSession(session: Session, token: JWT): Session {
  session.user.id = token.id ?? token.sub ?? ""
  session.user.memberships = token.memberships ?? []
  session.user.activeOrganizationId = token.activeOrganizationId ?? null
  const active = session.user.memberships.find(
    (m) => m.organizationId === session.user.activeOrganizationId,
  )
  session.user.activeRole = active?.role ?? null
  session.user.activeGrupoScoutId = active?.grupoScoutId ?? null
  session.user.activeOrganizationNombre = active?.organizationNombre ?? null
  return session
}

export const authConfig = {
  providers: [Google],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    maxAge: 7 * 24 * 60 * 60, // 7 días — cubre jornada scout sin red (Plan 7b)
  },
  callbacks: {
    session({ session, token }) {
      return buildSession(session, token)
    },
    authorized({ auth, request: { nextUrl } }) {
      const isPublic = PUBLIC_PATHS.some((p) => nextUrl.pathname.startsWith(p))
      if (isPublic) return true

      if (!auth?.user) {
        return Response.redirect(new URL("/login", nextUrl))
      }

      const hasMembership = (auth.user.memberships?.length ?? 0) > 0
      const isOnboarding = nextUrl.pathname.startsWith(ONBOARDING_PATH)

      if (!hasMembership && !isOnboarding) {
        return Response.redirect(new URL("/onboarding", nextUrl))
      }

      if (hasMembership && isOnboarding) {
        return Response.redirect(new URL("/dashboard", nextUrl))
      }

      return true
    },
  },
} satisfies NextAuthConfig
