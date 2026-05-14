"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import messages from "@/messages/es.json"

const nav = [
  { href: "/admin/eventos", label: messages.admin.nav.eventos },
  { href: "/admin/postas", label: messages.admin.nav.postas },
  { href: "/admin/plantillas", label: messages.admin.nav.plantillas },
  { href: "/admin/miembros", label: messages.admin.nav.miembros },
  { href: "/admin/invitaciones", label: messages.admin.nav.invitaciones },
  { href: "/admin/grupos", label: messages.admin.nav.grupos },
  { href: "/admin/distrito", label: messages.admin.nav.distrito },
]

export function AdminNav() {
  const pathname = usePathname()
  return (
    <nav className="border-b bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative">
          <div className="flex gap-2 overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {nav.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  pathname.startsWith(href)
                    ? "bg-brand text-white"
                    : "border border-gray-200 text-gray-600 hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
          {/* Fade hint that content scrolls */}
          <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-white" />
        </div>
      </div>
    </nav>
  )
}
