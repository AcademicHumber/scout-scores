"use client"
import { useActionState, useEffect, useState } from "react"
import { updateMembership, removeMembership } from "@/app/(app)/admin/miembros/actions"
import messages from "@/messages/es.json"

const ROLES = [
  { value: "ADMIN", label: "Administrador" },
  { value: "JUEZ", label: "Juez" },
  { value: "ESPECTADOR", label: "Espectador" },
  { value: "JEFE_PATRULLA", label: "Jefe de Patrulla" },
]

interface GrupoOption {
  id: string
  nombre: string
}

interface Props {
  membership: {
    id: string
    userId: string
    role: string
    grupoScoutId: string | null
    user: { name: string | null; email: string | null; image: string | null }
    grupoScout: { nombre: string } | null
  }
  grupos: GrupoOption[]
  currentUserId: string
}

export function MembershipRow({ membership, grupos, currentUserId }: Props) {
  const [updateState, updateAction, updatePending] = useActionState(updateMembership, null)
  const [removeState, removeAction, removePending] = useActionState(removeMembership, null)

  const [role, setRole] = useState(membership.role)
  const [grupoScoutId, setGrupoScoutId] = useState(membership.grupoScoutId ?? "")
  // Tracks the last successfully saved values so isDirty compares against what's in DB,
  // not against the original props (which don't update since we removed revalidateTag on updates).
  const [savedRole, setSavedRole] = useState(membership.role)
  const [savedGrupoScoutId, setSavedGrupoScoutId] = useState(membership.grupoScoutId ?? "")

  const isDirty = role !== savedRole || grupoScoutId !== savedGrupoScoutId

  // Sync from action result, not from props: props can be stale due to Next.js Router Cache.
  useEffect(() => {
    if (updateState && "membership" in updateState && updateState.membership) {
      const { role: newRole, grupoScoutId: newGrupo } = updateState.membership
      setRole(newRole)
      setGrupoScoutId(newGrupo ?? "")
      setSavedRole(newRole)
      setSavedGrupoScoutId(newGrupo ?? "")
    }
  }, [updateState])

  const isCurrentUser = membership.userId === currentUserId

  function handleRemove(e: React.FormEvent<HTMLFormElement>) {
    const ok = window.confirm(
      messages.admin.miembros.removeConfirm.replace(
        "{{nombre}}",
        membership.user.name ?? membership.user.email ?? "este miembro",
      ),
    )
    if (!ok) e.preventDefault()
  }

  return (
    <div className={`p-4${isCurrentUser ? " border-l-4 border-brand" : ""}`}>
      {/* Avatar + nombre */}
      <div className="flex items-center gap-3 mb-4">
        {membership.user.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={membership.user.image}
            alt=""
            className="h-10 w-10 shrink-0 rounded-full"
          />
        )}
        <div className="min-w-0">
          <p className="font-medium text-gray-900 truncate">
            {membership.user.name ?? "—"}
            {isCurrentUser && (
              <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">
                Vos
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500 truncate">{membership.user.email}</p>
        </div>
      </div>

      {/* Selects — controlled inputs that drive state; not inside any form */}
      <div className="space-y-3 mb-4">
        <div>
          <p className="mb-1 text-xs font-medium text-gray-500">{messages.admin.miembros.columns.role}</p>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-gray-500">{messages.admin.miembros.columns.grupo}</p>
          <select
            value={grupoScoutId}
            onChange={(e) => setGrupoScoutId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
          >
            <option value="">Sin grupo</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>{g.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Action row: two sibling forms side by side */}
      <div className="flex items-center justify-between gap-2">
        <form action={updateAction} className="flex items-center gap-2">
          <input type="hidden" name="membershipId" value={membership.id} />
          <input type="hidden" name="role" value={role} />
          <input type="hidden" name="grupoScoutId" value={grupoScoutId} />
          {isDirty && (
            <button
              type="submit"
              disabled={updatePending}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {updatePending ? "..." : messages.admin.miembros.save}
            </button>
          )}
          {updateState && "error" in updateState && updateState.error && (
            <span className="text-xs text-red-600">{updateState.error}</span>
          )}
          {!isDirty && updateState && "success" in updateState && updateState.success && (
            <span className="text-xs text-green-600">{messages.admin.miembros.saved}</span>
          )}
        </form>

        <form action={removeAction} onSubmit={handleRemove} className="flex items-center gap-2">
          <input type="hidden" name="id" value={membership.id} />
          {removeState?.error && (
            <span className="text-xs text-red-600">{removeState.error}</span>
          )}
          <button
            type="submit"
            disabled={removePending}
            className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            {removePending ? "..." : messages.admin.miembros.remove}
          </button>
        </form>
      </div>
    </div>
  )
}
