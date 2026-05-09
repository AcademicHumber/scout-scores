import { notFound } from "next/navigation"
import { requireRole } from "@/lib/auth-helpers"
import { findScoreSheetForJuez } from "@/repositories/score-sheet.repo"
import { ScoreSheetForm } from "@/components/juez/ScoreSheetForm"
import { Breadcrumb } from "@/components/juez/Breadcrumb"
import { BusinessError } from "@/lib/errors"
import messages from "@/messages/es.json"

const t = messages.juez

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

  return (
    <div>
      <Breadcrumb
        items={[
          { label: t.eventos.title, href: "/juez/eventos" },
          { label: asignacion.eventoNombre, href: `/juez/eventos/${asignacion.eventoId}` },
          { label: asignacion.postaNombre, href: `/juez/postas/${asignacionId}` },
        ]}
      />

      <ScoreSheetForm
        asignacionId={asignacionId}
        patrullaId={patrullaId}
        patrullaNombre={patrullaNombre}
        backHref={`/juez/postas/${asignacionId}`}
        template={asignacion.template ? {
          ...asignacion.template,
          valoresValidos: asignacion.template.valoresValidos.map(Number),
          valoresValidosDesempate: asignacion.template.valoresValidosDesempate.map(Number),
        } : null}
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
