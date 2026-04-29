"use client"
import { useActionState } from "react"
import { revokeInvitation } from "./actions"
import messages from "@/messages/es.json"

interface Props {
  id: string
  email: string
}

export function RevokeButton({ id, email }: Props) {
  const [state, action, pending] = useActionState(revokeInvitation, null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const ok = window.confirm(
      messages.admin.invitaciones.revokeConfirm.replace("{{email}}", email),
    )
    if (!ok) e.preventDefault()
  }

  return (
    <form action={action} onSubmit={handleSubmit} className="inline">
      <input type="hidden" name="id" value={id} />
      {state?.error && <span className="mr-2 text-xs text-red-600">{state.error}</span>}
      <button
        type="submit"
        disabled={pending}
        className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
      >
        {pending ? "..." : messages.admin.invitaciones.revoke}
      </button>
    </form>
  )
}
