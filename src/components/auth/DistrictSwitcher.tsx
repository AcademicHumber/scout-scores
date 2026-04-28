"use client"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

export function DistrictSwitcher() {
  const { data, update } = useSession()
  const router = useRouter()
  const memberships = data?.user.memberships ?? []
  const active = data?.user.activeOrganizationId

  if (memberships.length <= 1) return null

  return (
    <select
      value={active ?? ""}
      onChange={async (e) => {
        await update({ activeOrganizationId: e.target.value })
        router.refresh()
      }}
      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
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
