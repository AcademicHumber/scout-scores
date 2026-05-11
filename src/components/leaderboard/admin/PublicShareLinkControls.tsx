"use client"

import { useActionState, useState } from "react"
import {
  rotatePublicShareLinkAction,
  revokePublicShareLinkAction,
} from "@/app/(app)/admin/eventos/[id]/leaderboard/actions"

type Props = {
  eventoId: string
  activeLink: { token: string; createdAt: Date } | null
  baseUrl: string
}

type State = { success: true; token?: string } | { error: string } | null

export function PublicShareLinkControls({ eventoId, activeLink, baseUrl }: Props) {
  const [rotateState, rotateDispatch, isRotating] = useActionState<State, FormData>(
    rotatePublicShareLinkAction,
    null,
  )
  const [revokeState, revokeDispatch, isRevoking] = useActionState<State, FormData>(
    revokePublicShareLinkAction,
    null,
  )
  const [copied, setCopied] = useState(false)

  const currentToken =
    rotateState && "success" in rotateState && rotateState.token
      ? rotateState.token
      : activeLink?.token ?? null

  const fullUrl = currentToken ? `${baseUrl}/resultados/${currentToken}` : null

  const hasActiveLink = !!currentToken
  const isRevoked = revokeState && "success" in revokeState && !currentToken

  async function handleCopy() {
    if (!fullUrl) return
    await navigator.clipboard.writeText(fullUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isRevoked) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500">No hay link activo. El link fue revocado.</p>
        <form action={rotateDispatch}>
          <input type="hidden" name="eventoId" value={eventoId} />
          <button
            type="submit"
            disabled={isRotating}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {isRotating ? "Generando…" : "Generar nuevo link"}
          </button>
        </form>
      </div>
    )
  }

  if (!hasActiveLink) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500">No hay link público activo para este evento.</p>
        {rotateState && "error" in rotateState && (
          <p className="text-sm text-red-600">{rotateState.error}</p>
        )}
        <form action={rotateDispatch}>
          <input type="hidden" name="eventoId" value={eventoId} />
          <button
            type="submit"
            disabled={isRotating}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {isRotating ? "Generando…" : "Generar link público"}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={fullUrl ?? ""}
          className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-mono text-gray-700 select-all"
        />
        <button
          onClick={handleCopy}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 transition-colors whitespace-nowrap"
        >
          {copied ? "¡Copiado!" : "Copiar"}
        </button>
      </div>

      {(rotateState && "error" in rotateState) && (
        <p className="text-sm text-red-600">{rotateState.error}</p>
      )}
      {(revokeState && "error" in revokeState) && (
        <p className="text-sm text-red-600">{revokeState.error}</p>
      )}

      <div className="flex gap-2">
        <form action={rotateDispatch}>
          <input type="hidden" name="eventoId" value={eventoId} />
          <button
            type="submit"
            disabled={isRotating || isRevoking}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {isRotating ? "Generando…" : "Revocar y generar nuevo"}
          </button>
        </form>

        <form action={revokeDispatch}>
          <input type="hidden" name="eventoId" value={eventoId} />
          <button
            type="submit"
            disabled={isRotating || isRevoking}
            className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {isRevoking ? "Revocando…" : "Revocar (sin reemplazar)"}
          </button>
        </form>
      </div>
    </div>
  )
}
