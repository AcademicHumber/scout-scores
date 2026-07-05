"use client"

import { SessionProvider } from "next-auth/react"
import type { Session } from "next-auth"

// `session` inicial requerido: sin él, SessionProvider arranca en loading=true, y
// next-auth descarta en silencio (`if (loading) return`) cualquier llamada a `update()`
// que ocurra antes de que termine su propio fetch inicial de sesión — exactamente lo que
// hace SessionRefresher al montar. (Ver Plan 13d).
export function Providers({
  children,
  session,
}: {
  children: React.ReactNode
  session: Session | null
}) {
  return <SessionProvider session={session}>{children}</SessionProvider>
}
