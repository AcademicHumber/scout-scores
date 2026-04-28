"use client"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export function MembershipRefresher() {
  const { update } = useSession()
  const router = useRouter()

  useEffect(() => {
    update({ refreshMemberships: true }).then(() => router.refresh())
  }, [update, router])

  return null
}
