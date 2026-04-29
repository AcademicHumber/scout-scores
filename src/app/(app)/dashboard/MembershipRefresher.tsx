"use client"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

export function MembershipRefresher() {
  const { update } = useSession()
  const router = useRouter()
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true
    update({ refreshMemberships: true }).then(() => router.refresh())
  }, [update, router])

  return null
}
