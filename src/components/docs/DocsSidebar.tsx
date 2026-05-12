"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { docRoles, HOME_HREF } from "./DocsNav"

type Props = {
  open: boolean
  onClose: () => void
}

export function DocsSidebar({ open, onClose }: Props) {
  const pathname = usePathname()

  const navItems = [
    { title: "Inicio", href: HOME_HREF, dot: "bg-gray-400" },
    ...docRoles.map((r) => ({ title: r.title, href: r.href, dot: r.classes.dot })),
  ]

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`fixed top-14 left-0 z-40 h-[calc(100vh-3.5rem)] w-64 overflow-y-auto border-r border-gray-200 bg-gray-50 transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <nav className="p-4">
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            Guías por rol
          </p>
          <ul className="space-y-0.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                      isActive
                        ? "border-l-[3px] border-l-[#622599] bg-[#f3edf7] font-medium text-[#622599] pl-[7px]"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${item.dot}`} />
                    {item.title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>
    </>
  )
}
