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
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {membership.user.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={membership.user.image}
              alt=""
              className="h-8 w-8 rounded-full"
            />
          )}
          <div>
            <p className="font-medium text-gray-900">
              {membership.user.name ?? "—"}
              {isCurrentUser && (
                <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">
                  Vos
                </span>
              )}
            </p>
            <p className="text-xs text-gray-500">{membership.user.email}</p>
          </div>
        </div>
      </td>

      <td className="px-4 py-3">
        <form action={updateAction} className="flex items-center gap-2">
          <input type="hidden" name="membershipId" value={membership.id} />
          <select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-brand focus:outline-none"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <select
            name="grupoScoutId"
            value={grupoScoutId}
            onChange={(e) => setGrupoScoutId(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-brand focus:outline-none"
          >
            <option value="">Sin grupo</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>{g.nombre}</option>
            ))}
          </select>
          {isDirty && (
            <button
              type="submit"
              disabled={updatePending}
              className="rounded bg-brand px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
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
      </td>

      <td className="px-4 py-3 text-right">
        <form action={removeAction} onSubmit={handleRemove} className="inline">
          <input type="hidden" name="id" value={membership.id} />
          {removeState?.error && (
            <span className="mr-2 text-xs text-red-600">{removeState.error}</span>
          )}
          <button
            type="submit"
            disabled={removePending}
            className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            {removePending ? "..." : messages.admin.miembros.remove}
          </button>
        </form>
      </td>
    </tr>
  )
}
