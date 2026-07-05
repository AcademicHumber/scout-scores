import { auth } from "@/auth"
import { requireOrg } from "@/lib/auth-helpers"
import { AppHeader } from "@/components/auth/AppHeader"
import { SessionRefresher } from "@/components/auth/SessionRefresher"
import { Providers } from "./providers"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [, session] = await Promise.all([requireOrg(), auth()])

  return (
    <Providers session={session}>
      <div className="min-h-screen bg-gray-50">
        <SessionRefresher />
        <AppHeader />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </Providers>
  )
}
