import { auth } from "@/auth"
import { NextResponse } from "next/server"

const PUBLIC_PATHS = ["/login", "/api/auth"]
const ONBOARDING_PATH = "/onboarding"

export default auth((req) => {
  const { nextUrl } = req
  const isPublic = PUBLIC_PATHS.some((p) => nextUrl.pathname.startsWith(p))
  const isOnboarding = nextUrl.pathname.startsWith(ONBOARDING_PATH)

  if (isPublic) return NextResponse.next()

  if (!req.auth) {
    const url = nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  const hasMembership = (req.auth.user.memberships?.length ?? 0) > 0

  if (!hasMembership && !isOnboarding) {
    const url = nextUrl.clone()
    url.pathname = "/onboarding"
    return NextResponse.redirect(url)
  }

  if (hasMembership && isOnboarding) {
    const url = nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
}
