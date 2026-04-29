import { getCurrentOrg } from "@/lib/auth-helpers"
import { AdminNav } from "@/components/admin/AdminNav"
import Link from "next/link"
import messages from "@/messages/es.json"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const org = await getCurrentOrg()

  if (org?.role !== "ADMIN") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Sin acceso</h1>
        <p className="text-gray-600">{messages.admin.errors.forbidden}</p>
        <Link
          href="/dashboard"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Volver al dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="-mx-4 -mt-8 sm:-mx-6 lg:-mx-8">
      <AdminNav />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  )
}
