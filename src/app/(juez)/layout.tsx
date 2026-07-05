import { SessionProvider } from "next-auth/react"
import { auth } from "@/auth"
import { SessionRefresher } from "@/components/auth/SessionRefresher"

export default async function JuezGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return (
    <SessionProvider session={session}>
      <SessionRefresher />
      {children}
    </SessionProvider>
  )
}
