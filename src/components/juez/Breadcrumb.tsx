import Link from "next/link"

type BreadcrumbItem = {
  label: string
  href: string
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  const backItem = items[items.length - 1]
  const ancestors = items.slice(0, -1)

  return (
    <nav className="mb-5" aria-label="Navegación">
      {ancestors.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-gray-400 mb-1 flex-wrap min-w-0">
          {ancestors.map((item, i) => (
            <span key={i} className="flex items-center gap-1 min-w-0">
              {i > 0 && <span aria-hidden="true" className="shrink-0">›</span>}
              <Link
                href={item.href}
                className="hover:text-brand truncate max-w-[100px] sm:max-w-[160px] transition-colors"
              >
                {item.label}
              </Link>
            </span>
          ))}
          <span aria-hidden="true" className="shrink-0">›</span>
        </div>
      )}

      <Link
        href={backItem.href}
        className="inline-flex items-center gap-1.5 text-brand font-semibold text-base hover:text-brand-dark active:text-brand-dark transition-colors"
      >
        <span className="text-xl leading-none" aria-hidden="true">←</span>
        <span>{backItem.label}</span>
      </Link>
    </nav>
  )
}
