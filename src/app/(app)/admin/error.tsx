"use client"
import Link from "next/link"

export default function AdminError({ error }: { error: Error }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-xl font-semibold text-gray-900">Error inesperado</h1>
      <p className="text-sm text-gray-600">{error.message}</p>
      <Link
        href="/dashboard"
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Volver al dashboard
      </Link>
    </div>
  )
}
