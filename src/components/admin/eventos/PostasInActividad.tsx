import { PostaRow } from "./PostaRow"
import { AddPostaForm } from "./AddPostaForm"
import messages from "@/messages/es.json"

const m = messages.admin.eventos.postas

type Template = { id: string; nombre: string; archivedAt: Date | null } | null

type Posta = {
  id: string
  nombre: string
  descripcion: string | null
  weight: string
  templateId: string | null
  template: Template
  juezUserId: string | null
  juezUser: { id: string; name: string | null; email: string } | null
  orden: number
}

type Props = {
  actividadId: string
  postas: Posta[]
  isLocked: boolean
  templates: Array<{ id: string; nombre: string }>
  jueces: Array<{ userId: string; name: string | null; email: string }>
}

export function PostasInActividad({ actividadId, postas, isLocked, templates, jueces }: Props) {
  return (
    <div className="mt-2 border-l-2 border-brand/10 pl-2">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">{m.title}</p>

      {postas.length === 0 ? (
        <p className="text-xs text-gray-400">{m.empty}</p>
      ) : (
        <div className="space-y-1">
          {postas.map((p, idx) => (
            <PostaRow
              key={p.id}
              posta={p}
              isFirst={idx === 0}
              isLast={idx === postas.length - 1}
              isLocked={isLocked}
              templates={templates.filter((t) => t !== null) as Array<{ id: string; nombre: string }>}
              jueces={jueces}
            />
          ))}
        </div>
      )}

      {!isLocked && <AddPostaForm actividadId={actividadId} />}
    </div>
  )
}
