import { getCurrentUser } from "@/lib/auth-helpers"
import { DistrictSwitcher } from "./DistrictSwitcher"
import { SignOutButton } from "./SignOutButton"
import { MobileMenu } from "./MobileMenu"
import Link from "next/link"
import messages from "@/messages/es.json"

export async function AppHeader() {
  const user = await getCurrentUser()
  const isAdmin = user?.activeRole === "ADMIN"
  const isJuez = user?.activeRole === "JUEZ" || isAdmin

  return (
    <header className="bg-brand">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">

          {/* Left: brand + district switcher + desktop nav links */}
          <div className="flex items-center gap-3">
            <span className="font-semibold text-white">Puntajes Scout</span>
            {user && <DistrictSwitcher />}
            {isAdmin && (
              <Link
                href="/admin"
                className="hidden sm:block rounded-lg border border-white/40 px-3 py-1.5 text-sm text-white hover:bg-white/10 transition-colors"
              >
                {messages.auth.header.admin}
              </Link>
            )}
            {isJuez && (
              <Link
                href="/juez/eventos"
                className="hidden sm:block rounded-lg border border-white/40 px-3 py-1.5 text-sm text-white hover:bg-white/10 transition-colors"
              >
                {messages.auth.header.juez}
              </Link>
            )}
            {user && (
              <Link
                href="/eventos"
                className="hidden sm:block rounded-lg border border-white/40 px-3 py-1.5 text-sm text-white hover:bg-white/10 transition-colors"
              >
                Eventos
              </Link>
            )}
          </div>

          {/* Right: desktop profile + logout / mobile hamburger */}
          <div className="flex items-center gap-3">
            <Link
              href="/perfil/seguridad"
              className="hidden sm:flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/10 transition-colors"
            >
              {user?.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt={user.name ?? ""}
                  className="h-8 w-8 rounded-full ring-2 ring-white/30"
                />
              )}
              <span className="text-sm text-white/80">{user?.name}</span>
            </Link>
            <SignOutButton
              label={messages.auth.header.logout}
              className="hidden sm:block rounded-lg border border-white/40 px-3 py-1.5 text-sm text-white hover:bg-white/10 transition-colors"
            />
            {user && (
              <MobileMenu
                name={user.name ?? null}
                email={user.email}
                image={user.image ?? null}
                isAdmin={isAdmin}
                isJuez={isJuez}
              />
            )}
          </div>

        </div>
      </div>
    </header>
  )
}
