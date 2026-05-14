export type DocRole = {
  title: string
  href: string
  description: string
  classes: {
    border: string
    bg: string
    text: string
    iconBg: string
    dot: string
  }
  iconPath: string
}

export const HOME_HREF = "/docs"

export const docRoles: DocRole[] = [
  {
    title: "Instalar la app",
    href: "/docs/instalar-app",
    description: "Cómo instalar Puntajes Scout como app en iOS y Android desde el navegador.",
    classes: {
      border: "border-t-[#622599]",
      bg: "bg-[#f3edf7]",
      text: "text-[#622599]",
      iconBg: "bg-[#622599]",
      dot: "bg-[#622599]",
    },
    iconPath: "M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z",
  },
  {
    title: "Administrador",
    href: "/docs/administrador",
    description: "Gestiona el distrito, crea eventos, configura postas y publica resultados.",
    classes: {
      border: "border-t-[#622599]",
      bg: "bg-[#f3edf7]",
      text: "text-[#622599]",
      iconBg: "bg-[#622599]",
      dot: "bg-[#622599]",
    },
    iconPath:
      "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  },
  {
    title: "Juez",
    href: "/docs/juez",
    description: "Carga puntajes en tus postas asignadas, incluso sin conexión a internet.",
    classes: {
      border: "border-t-amber-500",
      bg: "bg-amber-50",
      text: "text-amber-700",
      iconBg: "bg-amber-500",
      dot: "bg-amber-500",
    },
    iconPath:
      "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  },
  {
    title: "Jefe de Patrulla",
    href: "/docs/jefe-patrulla",
    description: "Seguí los resultados de tu patrulla y comparalos con el resto.",
    classes: {
      border: "border-t-emerald-500",
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      iconBg: "bg-emerald-500",
      dot: "bg-emerald-500",
    },
    iconPath:
      "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  },
  {
    title: "Espectador",
    href: "/docs/espectador",
    description: "Mirá el leaderboard en tiempo real durante el evento.",
    classes: {
      border: "border-t-sky-500",
      bg: "bg-sky-50",
      text: "text-sky-700",
      iconBg: "bg-sky-500",
      dot: "bg-sky-500",
    },
    iconPath:
      "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
  },
  {
    title: "Resultados públicos",
    href: "/docs/resultados",
    description: "Compartí los resultados finales sin que el público necesite una cuenta.",
    classes: {
      border: "border-t-rose-500",
      bg: "bg-rose-50",
      text: "text-rose-700",
      iconBg: "bg-rose-500",
      dot: "bg-rose-500",
    },
    iconPath:
      "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
  },
]
