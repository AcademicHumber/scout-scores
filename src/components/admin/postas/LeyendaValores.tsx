type Props = {
  valores: number[]
  values: Record<string, string>
  onChange: (valor: string, texto: string) => void
}

export function LeyendaValores({ valores, values, onChange }: Props) {
  return (
    <div className="space-y-2">
      {valores.map((v) => (
        <div key={v} className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-gray-200 bg-white text-sm font-bold text-gray-700">
            {v}
          </span>
          <input
            value={values[String(v)] ?? ""}
            onChange={(e) => onChange(String(v), e.target.value)}
            placeholder="Qué significa este puntaje"
            maxLength={200}
            className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      ))}
    </div>
  )
}
