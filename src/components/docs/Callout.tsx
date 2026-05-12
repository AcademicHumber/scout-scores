type CalloutType = "tip" | "important"

const styles: Record<CalloutType, { border: string; bg: string; label: string; labelColor: string }> = {
  tip: {
    border: "border-l-[#622599]",
    bg: "bg-[#f3edf7]",
    label: "Tip",
    labelColor: "text-[#622599]",
  },
  important: {
    border: "border-l-amber-500",
    bg: "bg-amber-50",
    label: "Importante",
    labelColor: "text-amber-700",
  },
}

export function Callout({
  type = "tip",
  children,
}: {
  type?: CalloutType
  children: React.ReactNode
}) {
  const s = styles[type]
  return (
    <div className={`my-4 rounded-r-lg border-l-4 ${s.border} ${s.bg} px-4 py-3`}>
      <span className={`block mb-0.5 text-xs font-bold uppercase tracking-wide ${s.labelColor}`}>
        {s.label}
      </span>
      <div className="text-sm leading-relaxed text-gray-700">{children}</div>
    </div>
  )
}
