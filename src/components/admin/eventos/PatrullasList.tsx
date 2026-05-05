import { PatrullaRow } from "./PatrullaRow"
import { AddPatrullaForm } from "./AddPatrullaForm"
import messages from "@/messages/es.json"
import type { PatrullaCategoria } from "@/generated/prisma/enums"

const m = messages.admin.eventos.patrullas

type Patrulla = {
  id: string
  nombre: string
  grupoScoutId: string
  grupoScout: { id: string; nombre: string }
  categoria: PatrullaCategoria | null
}

type Props = {
  eventoId: string
  patrullas: Patrulla[]
  grupos: Array<{ id: string; nombre: string }>
}

export function PatrullasList({ eventoId, patrullas, grupos }: Props) {
  return (
    <div className="space-y-2">
      {patrullas.length === 0 ? (
        <p className="text-sm text-gray-500">{m.empty}</p>
      ) : (
        <div className="space-y-2">
          {patrullas.map((p) => (
            <PatrullaRow key={p.id} patrulla={p} grupos={grupos} />
          ))}
        </div>
      )}
      <AddPatrullaForm eventoId={eventoId} grupos={grupos} />
    </div>
  )
}
