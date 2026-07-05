import type { NextAuthConfig, Session } from "next-auth"
import type { JWT } from "next-auth/jwt"
import Google from "next-auth/providers/google"

const PUBLIC_PATHS = [
  "/login",
  "/registro",
  "/api/auth",
  "/api/health",
  "/invite",
  "/resultados",
  "/docs",
  "/manifest.webmanifest",
]
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
    authorized({ auth, request }) {
      const { nextUrl } = request
      const isPublic = PUBLIC_PATHS.some((p) => nextUrl.pathname.startsWith(p))
      if (isPublic) return true

      if (!auth?.user) {
        return Response.redirect(new URL("/login", nextUrl))
      }

      // Los POST de Server Actions van a la URL de la página que las invocó
      // (`canonicalUrl` del cliente), que puede quedar desincronizada tras una cadena de
      // redirects anidados (ej: signIn → /dashboard → el layout de /dashboard redirige a
      // /onboarding). Las reglas de abajo son guías de navegación para decidir a dónde
      // mandar al usuario, no un gate de seguridad — la action ya redirige correctamente
      // por su cuenta al terminar. Aplicarlas a una Server Action puede interceptar su POST
      // contra una URL vieja y devolver un redirect HTTP crudo en vez del mecanismo interno
      // de Next, rompiendo la respuesta que el cliente espera ("unexpected response was
      // received from the server"). Ver Plan 13c.
      if (request.headers.has("next-action")) return true

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
