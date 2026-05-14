import { type ReactNode } from "react"
import { requireRole, getCurrentUser } from "@/lib/auth-helpers"
import { SignOutButton } from "@/components/auth/SignOutButton"
import { MobileMenu } from "@/components/auth/MobileMenu"
import { SyncStatusBadge } from "@/components/juez/SyncStatusBadge"
import { ServiceWorkerRegistrar } from "@/components/juez/ServiceWorkerRegistrar"
import messages from "@/messages/es.json"

export default async function JuezLayout({ children }: { children: ReactNode }) {
  const [org, user] = await Promise.all([
    requireRole(["JUEZ", "ADMIN"]),
    getCurrentUser(),
  ])

  const isAdmin = org.role === "ADMIN"

  return (
    <div className="min-h-dvh bg-stone-100">
      <ServiceWorkerRegistrar />
      <header className="sticky top-0 z-10 bg-brand text-white shadow-md">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-base leading-none tracking-tight">{messages.app.name}</p>
            <p className="text-xs text-white/70 mt-0.5 truncate">{org.nombre}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SyncStatusBadge userId={org.userId} organizationId={org.organizationId} />
            {isAdmin ? (
              <MobileMenu
                name={user?.name ?? null}
                email={user?.email ?? ""}
                image={user?.image ?? null}
                isAdmin={true}
                isJuez={false}
                alwaysVisible
              />
            ) : (
              <SignOutButton
                label={messages.juez.nav.salir}
                className="rounded-lg border border-white/30 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 active:bg-white/25 transition-colors"
              />
            )}
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6 pb-8">{children}</main>
    </div>
  )
}
