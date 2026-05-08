import { type ReactNode } from "react"
import { requireRole } from "@/lib/auth-helpers"
import { SignOutButton } from "@/components/auth/SignOutButton"

export default async function JuezLayout({ children }: { children: ReactNode }) {
  const org = await requireRole(["JUEZ", "ADMIN"])

  return (
    <div className="min-h-dvh bg-stone-50">
      <header className="bg-brand text-white px-4 py-3 flex items-center justify-between">
        <div className="font-bold text-lg">Puntajes Scout</div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden sm:inline opacity-90">{org.nombre}</span>
          <SignOutButton
            label="Salir"
            className="rounded-md border border-white/30 px-3 py-1.5 text-sm text-white hover:bg-white/10 transition-colors"
          />
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-4">{children}</main>
    </div>
  )
}
