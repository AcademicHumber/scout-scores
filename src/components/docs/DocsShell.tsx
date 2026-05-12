"use client"

import { useState } from "react"
import { DocsHeader } from "./DocsHeader"
import { DocsSidebar } from "./DocsSidebar"

export function DocsShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white">
      <DocsHeader onMenuClick={() => setSidebarOpen(true)} />
      <DocsSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content — offset for fixed header and desktop sidebar */}
      <main className="pt-14 md:ml-64">
        <div className="mx-auto max-w-3xl px-6 py-10">{children}</div>
      </main>
    </div>
  )
}
