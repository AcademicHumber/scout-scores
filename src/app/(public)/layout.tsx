import type { Metadata } from "next"
import { Barlow } from "next/font/google"
import "../globals.css"

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
  variable: "--font-barlow",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Resultados — Puntajes Scout",
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={barlow.variable}>
      <body className="min-h-screen bg-zinc-950 text-zinc-50 antialiased font-sans">
        {children}
      </body>
    </html>
  )
}
