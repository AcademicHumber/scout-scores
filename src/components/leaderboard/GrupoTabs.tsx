"use client"

type Grupo = { id: string; nombre: string }

type Props = {
  grupos: Grupo[]
  selected: string | null
  onChange: (grupoId: string | null) => void
}

export function GrupoTabs({ grupos, selected, onChange }: Props) {
  if (grupos.length <= 1) return null

  return (
    <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur border-b border-zinc-800">
      <div className="mx-auto max-w-4xl px-4">
        <div className="flex gap-1 overflow-x-auto py-3 scrollbar-none">
          <button
            onClick={() => onChange(null)}
            className={[
              "flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              selected === null
                ? "bg-amber-400 text-zinc-950"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800",
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
                selected === g.id
                  ? "bg-amber-400 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800",
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
