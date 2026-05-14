"use client"
import { useState } from "react"
import Link from "next/link"
import { SignOutButton } from "./SignOutButton"

interface Props {
  name: string | null
  email: string
  image: string | null
  isAdmin: boolean
  isJuez: boolean
  /** Muestra el botón hamburger en todos los tamaños de pantalla (sin sm:hidden) */
  alwaysVisible?: boolean
}

export function MobileMenu({ name, email, image, isAdmin, isJuez, alwaysVisible }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Hamburger button — mobile only */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Abrir menú"
        className={`${alwaysVisible ? "" : "sm:hidden "}flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-white/10 transition-colors`}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <rect y="3" width="20" height="2" rx="1" />
          <rect y="9" width="20" height="2" rx="1" />
          <rect y="15" width="20" height="2" rx="1" />
        </svg>
      </button>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-72 flex-col bg-white shadow-xl transform transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Profile block */}
        <div className="bg-brand flex items-start justify-between px-5 py-5">
          <div className="flex items-center gap-3 min-w-0">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt={name ?? ""}
                className="h-14 w-14 shrink-0 rounded-full ring-2 ring-white/30"
              />
            ) : (
              <div className="h-14 w-14 shrink-0 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-xl font-semibold text-white">
                  {name?.[0]?.toUpperCase() ?? "?"}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <p className="font-semibold text-white truncate">{name ?? "—"}</p>
              <p className="text-xs text-white/70 break-all">{email}</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
            className="ml-2 shrink-0 rounded-lg p-1.5 text-white/80 hover:bg-white/10 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
              <path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
            </svg>
          </button>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="flex items-center rounded-lg px-4 py-3 text-sm font-medium text-gray-700 hover:bg-brand/5 hover:text-brand transition-colors"
            >
              Administración
            </Link>
          )}
          {isJuez && (
            <Link
              href="/juez/eventos"
              onClick={() => setOpen(false)}
              className="flex items-center rounded-lg px-4 py-3 text-sm font-medium text-gray-700 hover:bg-brand/5 hover:text-brand transition-colors"
            >
              Vista del juez
            </Link>
          )}
          <Link
            href="/eventos"
            onClick={() => setOpen(false)}
            className="flex items-center rounded-lg px-4 py-3 text-sm font-medium text-gray-700 hover:bg-brand/5 hover:text-brand transition-colors"
          >
            Eventos
          </Link>
          <Link
            href="/perfil/seguridad"
            onClick={() => setOpen(false)}
            className="flex items-center rounded-lg px-4 py-3 text-sm font-medium text-gray-700 hover:bg-brand/5 hover:text-brand transition-colors"
          >
            Seguridad / Perfil
          </Link>
        </nav>

        {/* Sign out */}
        <div className="border-t border-gray-100 px-3 py-4">
          <SignOutButton
            label="Cerrar sesión"
            className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          />
        </div>
      </div>
    </>
  )
}
