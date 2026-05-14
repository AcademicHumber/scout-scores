"use client"

import { signOut } from "next-auth/react"

export function SignOutButton({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  return (
    <button
      onClick={() => signOut({ callbackUrl: `${window.location.origin}/login` })}
      className={
        className ??
        "rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
      }
    >
      {label}
    </button>
  )
}
