import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"

const PUBLIC_PATHS = ["/login", "/api/auth"]
const ONBOARDING_PATH = "/onboarding"

export const authConfig = {
  providers: [Google],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
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
