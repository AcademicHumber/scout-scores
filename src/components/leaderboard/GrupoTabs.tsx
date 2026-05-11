"use client"

type Grupo = { id: string; nombre: string }

type Props = {
  grupos: Grupo[]
  selected: string | null
  onChange: (grupoId: string | null) => void
  isDark?: boolean
}

export function GrupoTabs({ grupos, selected, onChange, isDark = false }: Props) {
  if (grupos.length <= 1) return null

  const stickyBg = isDark
    ? "bg-zinc-950/95 border-zinc-800"
    : "bg-gray-50/95 border-gray-200"

  const activeClass = "bg-brand text-white"
  const inactiveClass = isDark
    ? "text-zinc-400 hover:text-white hover:bg-white/10"
    : "text-gray-500 hover:text-brand hover:bg-brand-light"

  return (
    <div className={`sticky top-0 z-10 backdrop-blur border-b ${stickyBg}`}>
      <div className="mx-auto max-w-4xl px-4">
        <div className="flex gap-1 overflow-x-auto py-3 scrollbar-none">
          <button
            onClick={() => onChange(null)}
            className={[
              "flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              selected === null ? activeClass : inactiveClass,
            ].join(" ")}
          >
            Todos
          </button>
          {grupos.map((g) => (
            <button
              key={g.id}
              onClick={() => onChange(g.id)}
              className={[
                "flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                selected === g.id ? activeClass : inactiveClass,
              ].join(" ")}
            >
              {g.nombre}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
