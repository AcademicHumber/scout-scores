type Step = {
  title: string
  children: React.ReactNode
}

export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="mt-4 space-y-0">
      {steps.map((step, i) => (
        <li key={i} className="relative flex gap-4">
          {/* Vertical connector line */}
          {i < steps.length - 1 && (
            <div className="absolute left-[17px] top-10 bottom-0 w-px bg-gray-200" />
          )}
          {/* Circle number */}
          <div className="relative z-10 mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#622599] text-sm font-bold text-white shadow-sm">
            {i + 1}
          </div>
          {/* Content */}
          <div className="pb-8">
            <h3 className="mb-1.5 font-semibold text-gray-900">{step.title}</h3>
            <div className="text-sm leading-relaxed text-gray-600">{step.children}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}
