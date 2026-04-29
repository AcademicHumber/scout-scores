"use client"
import { useActionState, useState } from "react"
import { createInvitation } from "@/app/(app)/admin/invitaciones/actions"
import messages from "@/messages/es.json"

const ROLES = [
  { value: "JUEZ", label: "Juez" },
  { value: "ESPECTADOR", label: "Espectador" },
  { value: "JEFE_PATRULLA", label: "Jefe de Patrulla" },
  { value: "ADMIN", label: "Administrador" },
]

interface GrupoOption {
  id: string
  nombre: string
}

interface Props {
  grupos: GrupoOption[]
  appUrl: string
}

export function NewInvitationForm({ grupos, appUrl }: Props) {
  const [state, action, pending] = useActionState(createInvitation, null)
  const [copied, setCopied] = useState(false)

  const inviteLink = state?.token ? `${appUrl}/invite/${state.token}` : null

  async function handleCopy() {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{messages.admin.invitaciones.newTitle}</h2>
      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {messages.admin.invitaciones.emailLabel}
            </label>
            <input
              name="email"
              type="email"
              required
              placeholder="usuario@ejemplo.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {messages.admin.invitaciones.roleLabel}
            </label>
            <select
              name="role"
              required
              defaultValue="JUEZ"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {messages.admin.invitaciones.grupoLabel}
            </label>
            <select
              name="grupoScoutId"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="">Sin grupo</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>{g.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        {state?.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Creando..." : messages.admin.invitaciones.submit}
        </button>
      </form>

      {inviteLink && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="mb-2 text-sm font-medium text-green-800">
            {messages.admin.invitaciones.linkReady}
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={inviteLink}
              className="flex-1 rounded border border-green-300 bg-white px-3 py-1.5 text-xs text-gray-700 font-mono"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-lg border border-green-400 bg-white px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100"
            >
              {copied ? messages.admin.invitaciones.copied : messages.admin.invitaciones.copyLink}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
