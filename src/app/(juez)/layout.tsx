"use client"

import { SessionProvider } from "next-auth/react"

export default function JuezGroupLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
