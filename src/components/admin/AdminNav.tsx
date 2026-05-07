"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import messages from "@/messages/es.json"

const nav = [
  { href: "/admin/distrito", label: messages.admin.nav.distrito },
  { href: "/admin/grupos", label: messages.admin.nav.grupos },
  { href: "/admin/invitaciones", label: messages.admin.nav.invitaciones },
  { href: "/admin/miembros", label: messages.admin.nav.miembros },
  { href: "/admin/plantillas", label: messages.admin.nav.plantillas },
  { href: "/admin/postas", label: messages.admin.nav.postas },
  { href: "/admin/eventos", label: messages.admin.nav.eventos },
]

export function AdminNav() {
  const pathname = usePathname()
  return (
    <nav className="border-b bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex gap-6 overflow-x-auto py-3">
          {nav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`whitespace-nowrap text-sm font-medium transition-colors ${
                pathname.startsWith(href)
                  ? "border-b-2 border-brand pb-1 text-brand"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
