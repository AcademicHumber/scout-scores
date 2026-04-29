"use client"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

export function DistrictSwitcher() {
  const { data, update } = useSession()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const memberships = data?.user.memberships ?? []
  const active = data?.user.activeOrganizationId

  if (memberships.length <= 1) return null

  return (
    <select
      value={active ?? ""}
      disabled={isPending}
      onChange={(e) => {
        startTransition(async () => {
          await update({ activeOrganizationId: e.target.value })
          router.refresh()
        })
      }}
      className="rounded-md border border-white/40 bg-white/10 px-2 py-1 text-sm text-white disabled:opacity-50"
      aria-label="Cambiar de distrito"
    >
      {memberships.map((m) => (
        <option key={m.organizationId} value={m.organizationId}>
          {m.organizationNombre} ({m.role})
        </option>
      ))}
    </select>
  )
}
