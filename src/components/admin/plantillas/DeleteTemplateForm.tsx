"use client"
import { deleteTemplateSimple } from "@/app/(app)/admin/plantillas/actions"
import messages from "@/messages/es.json"

const m = messages.admin.plantillas

type Props = { id: string; nombre: string }

export function DeleteTemplateForm({ id, nombre }: Props) {
  return (
    <form
      action={deleteTemplateSimple}
      onSubmit={(e) => {
        if (!confirm(m.detail.deleteConfirm.replace("{{nombre}}", nombre))) e.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="w-full rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
      >
        {m.detail.deleteButton}
      </button>
    </form>
  )
}
