import { notFound } from "next/navigation"
import Link from "next/link"
import { requireRole } from "@/lib/auth-helpers"
import { findScoreSheetForJuez } from "@/repositories/score-sheet.repo"
import { ScoreSheetForm } from "@/components/juez/ScoreSheetForm"
import { BusinessError } from "@/lib/errors"

export default async function JuezPlanillaPage({
  params,
}: {
  params: Promise<{ asignacionId: string; patrullaId: string }>
}) {
  const { asignacionId, patrullaId } = await params
  const org = await requireRole(["JUEZ", "ADMIN"])

  let data
  try {
    data = await findScoreSheetForJuez(org.organizationId, asignacionId, patrullaId, org.userId, org.role === "ADMIN")
  } catch (err) {
    if (
      err instanceof BusinessError &&
      (err.code === "ASIGNACION_NO_ENCONTRADA" || err.code === "FORBIDDEN_NO_ASIGNADO")
    ) {
      notFound()
    }
    throw err
  }

  const { scoreSheet, asignacion, patrullaNombre } = data
  const isEnviada = scoreSheet?.estado === "ENVIADA"
  const backHref = `/juez/postas/${asignacionId}`

  return (
    <div>
      <div className="mb-4">
        <Link href={backHref} className="text-sm text-brand hover:underline">
          ← {asignacion.postaNombre}
        </Link>
        <p className="text-xs text-gray-400 mt-0.5">
          {asignacion.actividadNombre} · {asignacion.eventoNombre}
        </p>
      </div>

      <ScoreSheetForm
        asignacionId={asignacionId}
        patrullaId={patrullaId}
        patrullaNombre={patrullaNombre}
        backHref={backHref}
        template={asignacion.template}
        initialPuntajeUnico={
          scoreSheet?.puntajeUnico != null ? Number(scoreSheet.puntajeUnico) : null
        }
        initialEntries={
          scoreSheet?.entries.map((e) => ({
            criterionId: e.criterionId,
            valor: Number(e.valor),
          })) ?? []
        }
        isEnviada={isEnviada}
        totalPuntuable={scoreSheet?.totalPuntuable?.toString() ?? null}
        totalDesempate={scoreSheet?.totalDesempate?.toString() ?? null}
      />
    </div>
  )
}
