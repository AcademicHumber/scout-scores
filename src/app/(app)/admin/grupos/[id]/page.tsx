import { requireRole } from "@/lib/auth-helpers"
import { findGrupoById } from "@/repositories/grupo.repo"
import { GrupoEditForm } from "./GrupoEditForm"
import { notFound } from "next/navigation"
import Link from "next/link"

interface Props {
  params: Promise<{ id: string }>
}

export default async function GrupoEditPage({ params }: Props) {
  const { id } = await params
  const org = await requireRole(["ADMIN"])
  const grupo = await findGrupoById(org.organizationId, id)

  if (!grupo) notFound()

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin/grupos" className="hover:text-gray-900">Grupos</Link>
        <span>/</span>
        <span className="text-gray-900">{grupo.nombre}</span>
      </div>
      <GrupoEditForm grupo={grupo} />
    </div>
  )
}
