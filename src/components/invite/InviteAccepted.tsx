"use client"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

export function InviteAccepted() {
  const { update } = useSession()
  const router = useRouter()
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true
    update({ refreshMemberships: true }).then(() => {
      router.push("/dashboard")
    })
  }, [update, router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <p className="text-gray-600">Uniéndote al distrito...</p>
    </div>
  )
}
