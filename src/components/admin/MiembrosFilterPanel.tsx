"use client"

import { useState, useMemo } from "react"
import { MembershipRow } from "./MembershipRow"

const ROLES = [
  { value: "ADMIN", label: "Admin" },
  { value: "JUEZ", label: "Juez" },
  { value: "ESPECTADOR", label: "Espectador" },
  { value: "JEFE_PATRULLA", label: "Jefe Patrulla" },
]

type Membership = {
  id: string
  userId: string
  role: string
  grupoScoutId: string | null
  user: { name: string | null; email: string | null; image: string | null }
  grupoScout: { nombre: string } | null
}

type GrupoOption = { id: string; nombre: string }

type Props = {
  memberships: Membership[]
  grupos: GrupoOption[]
  currentUserId: string
}

export function MiembrosFilterPanel({ memberships, grupos, currentUserId }: Props) {
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<string | null>(null)

  // Counts per role matching the current search (ignoring role filter),
  // so chips always show how many members each role has for the current query.
  const countsForSearch = useMemo(() => {
    const q = search.toLowerCase().trim()
    const counts: Record<string, number> = { ALL: 0 }
    for (const r of ROLES) counts[r.value] = 0
    for (const m of memberships) {
      if (q) {
        const name = (m.user.name ?? "").toLowerCase()
        const email = (m.user.email ?? "").toLowerCase()
        if (!name.includes(q) && !email.includes(q)) continue
      }
      counts[m.role] = (counts[m.role] ?? 0) + 1
      counts.ALL++
    }
    return counts
  }, [memberships, search])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return memberships.filter((m) => {
      if (roleFilter && m.role !== roleFilter) return false
      if (q) {
        const name = (m.user.name ?? "").toLowerCase()
        const email = (m.user.email ?? "").toLowerCase()
        if (!name.includes(q) && !email.includes(q)) return false
      }
      return true
    })
  }, [memberships, search, roleFilter])

  return (
    <div className="space-y-3">
      {/* Buscador */}
      <div className="flex items-center gap-3 rounded-2xl border-2 border-gray-100 bg-white px-4 shadow-sm transition-colors focus-within:border-brand focus-within:shadow-md">
        <svg
          className="h-4 w-4 shrink-0 text-gray-400 transition-colors focus-within:text-brand"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o email…"
          className="flex-1 bg-transparent py-3.5 text-sm text-gray-800 outline-none placeholder:text-gray-400"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            aria-label="Limpiar búsqueda"
            className="shrink-0 rounded-full p-1 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-500"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Chips de rol */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-2 min-w-max">
          <RoleChip
            label="Todos"
            count={countsForSearch.ALL}
            selected={roleFilter === null}
            onClick={() => setRoleFilter(null)}
          />
          {ROLES.map((r) => (
            <RoleChip
              key={r.value}
              label={r.label}
              count={countsForSearch[r.value]}
              selected={roleFilter === r.value}
              onClick={() => setRoleFilter(roleFilter === r.value ? null : r.value)}
            />
          ))}
        </div>
      </div>

      {/* Encabezado de resultados */}
      <div className="flex items-center justify-between px-0.5">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
          {roleFilter
            ? ROLES.find((r) => r.value === roleFilter)?.label
            : "Todos los roles"}
        </p>
        <p className="text-xs text-gray-400">
          {filtered.length === memberships.length
            ? `${memberships.length} miembros`
            : `${filtered.length} de ${memberships.length}`}
        </p>
      </div>

      {/* Lista o estado vacío */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-14 text-center shadow-sm">
          <p className="text-sm font-medium text-gray-400">Sin resultados</p>
          <p className="mt-1 text-xs text-gray-300">
            {search ? `Ningún miembro coincide con "${search}"` : "No hay miembros con ese rol."}
          </p>
        </div>
      ) : (
        <div className="divide-y overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {filtered.map((m) => (
            <MembershipRow
              key={m.id}
              membership={m}
              grupos={grupos}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RoleChip({
  label, count, selected, onClick,
}: {
  label: string
  count: number
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-[40px] shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-all active:scale-95 ${
        selected
          ? "bg-brand text-white shadow-md"
          : "border border-gray-200 bg-white text-gray-600 shadow-sm hover:border-brand/40 hover:text-brand"
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
        selected ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
      }`}>
        {count}
      </span>
    </button>
  )
}
