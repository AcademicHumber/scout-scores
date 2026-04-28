"use client"

import { signOut } from "next-auth/react"

export function SignOutButton({ label }: { label: string }) {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
    >
      {label}
    </button>
  )
}
