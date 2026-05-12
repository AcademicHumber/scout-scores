import Link from "next/link"

type Props = {
  onMenuClick: () => void
}

export function DocsHeader({ onMenuClick }: Props) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuClick}
        className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 md:hidden"
        aria-label="Abrir menú"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Brand + section */}
      <Link href="/docs" className="flex items-center gap-2 min-w-0">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#622599] text-xs font-bold text-white">
          PS
        </span>
        <span className="hidden truncate text-sm font-semibold text-gray-900 sm:block">
          Puntajes Scout
        </span>
        <span className="hidden text-gray-300 sm:block">/</span>
        <span className="truncate text-sm font-medium text-[#622599] sm:text-gray-500">
          Documentación
        </span>
      </Link>

      <div className="flex-1" />

      {/* Link to app */}
      <Link
        href="/dashboard"
        className="hidden items-center gap-1.5 rounded-lg border border-[#622599] px-3 py-1.5 text-sm font-medium text-[#622599] hover:bg-[#f3edf7] transition-colors sm:flex"
      >
        Ir a la app
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </Link>
    </header>
  )
}
