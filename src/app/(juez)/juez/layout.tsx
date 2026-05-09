import { type ReactNode } from "react"
import { requireRole } from "@/lib/auth-helpers"
import { SignOutButton } from "@/components/auth/SignOutButton"
import messages from "@/messages/es.json"

export default async function JuezLayout({ children }: { children: ReactNode }) {
  const org = await requireRole(["JUEZ", "ADMIN"])

  return (
    <div className="min-h-dvh bg-stone-100">
      <header className="sticky top-0 z-10 bg-brand text-white shadow-md">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-base leading-none tracking-tight">{messages.app.name}</p>
            <p className="text-xs text-white/70 mt-0.5 truncate">{org.nombre}</p>
          </div>
          <SignOutButton
            label={messages.juez.nav.salir}
            className="shrink-0 rounded-lg border border-white/30 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 active:bg-white/25 transition-colors"
          />
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6 pb-8">{children}</main>
    </div>
  )
}
