"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import messages from "@/messages/es.json"

const m = messages.eventos.planificacion

export function SoloMisPostasToggle({ active }: { active: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function toggle() {
    const params = new URLSearchParams(searchParams.toString())
    if (active) {
      params.delete("soloMias")
    } else {
      params.set("soloMias", "1")
    }
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={active}
      className={[
        "min-h-[36px] rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-brand bg-brand text-white"
          : "border-gray-200 bg-white text-gray-600 hover:border-brand/40 hover:bg-brand/5 hover:text-brand",
      ].join(" ")}
    >
      {m.soloMisPostas}
    </button>
  )
}
