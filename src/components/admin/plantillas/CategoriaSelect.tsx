"use client"
import { useRouter, useSearchParams } from "next/navigation"

interface Option {
  value: string
  label: string
}

export function CategoriaSelect({ value, options }: { value: string; options: Option[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function onChange(categoria: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (categoria) {
      params.set("categoria", categoria)
    } else {
      params.delete("categoria")
    }
    const qs = params.toString()
    router.push(`/admin/plantillas${qs ? `?${qs}` : ""}`)
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border bg-white px-3 py-2 text-sm text-gray-600 focus:border-brand focus:outline-none"
    >
      {options.map((c) => (
        <option key={c.value} value={c.value}>{c.label}</option>
      ))}
    </select>
  )
}
