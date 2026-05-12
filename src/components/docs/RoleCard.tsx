import Link from "next/link"
import type { DocRole } from "./DocsNav"

export function RoleCard({ role }: { role: DocRole }) {
  return (
    <Link
      href={role.href}
      className={`group block rounded-xl border border-gray-200 border-t-4 ${role.classes.border} bg-white p-6 shadow-sm transition-all duration-150 hover:shadow-md hover:-translate-y-0.5`}
    >
      <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${role.classes.iconBg}`}>
        <svg
          className="h-6 w-6 text-white"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.75}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={role.iconPath} />
        </svg>
      </div>
      <h3 className={`mb-1 text-lg font-semibold ${role.classes.text}`}>{role.title}</h3>
      <p className="mb-4 text-sm leading-relaxed text-gray-500">{role.description}</p>
      <span className={`inline-flex items-center gap-1 text-sm font-medium ${role.classes.text} group-hover:gap-2 transition-all`}>
        Ver guía
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </span>
    </Link>
  )
}
