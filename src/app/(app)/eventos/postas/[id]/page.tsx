import { requireRole } from "@/lib/auth-helpers"
import { findPostaById } from "@/repositories/posta.repo"
import { notFound } from "next/navigation"
import Link from "next/link"
import { PostaDetailForm } from "@/components/admin/postas/PostaDetailForm"
import { updatePostaComoJuezAction, deletePostaComoJuezAction } from "../actions"
import messages from "@/messages/es.json"

const m = messages.eventos.misPostas

export default async function MiPostaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const org = await requireRole(["JUEZ", "ADMIN"])
  const { id } = await params

  const posta = await findPostaById(org.organizationId, id)
  if (!posta) notFound()
  if (org.role !== "ADMIN" && posta.creadoPorUserId !== org.userId) notFound()

  const materiales = Array.isArray(posta.materiales)
    ? (posta.materiales as Array<{ nombre: string; cantidad?: string }>)
    : []

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <div>
        <Link href="/eventos/postas" className="text-sm text-gray-500 hover:text-gray-700">
          {m.volver}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{posta.nombre}</h1>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <PostaDetailForm
          posta={{
            id: posta.id,
            nombre: posta.nombre,
            descripcion: posta.descripcion,
            duracionMinutos: posta.duracionMinutos,
            materiales,
            asignacionesCount: posta.asignaciones.length,
          }}
          updateAction={updatePostaComoJuezAction}
          deleteAction={deletePostaComoJuezAction}
        />
      </div>
    </div>
  )
}
