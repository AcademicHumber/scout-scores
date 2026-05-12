import { Callout } from "@/components/docs/Callout"

export const metadata = {
  title: "Resultados públicos — Puntajes Scout",
}

export default function ResultadosDocsPage() {
  return (
    <div>
      {/* Page header */}
      <div className="mb-8 border-b border-gray-100 pb-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </span>
          <span className="text-sm font-semibold text-rose-600">Resultados públicos</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Vista pública de resultados</h1>
        <p className="mt-2 text-base text-gray-500">
          Una página de resultados compartible con cualquier persona, sin que necesiten una cuenta en el sistema.
        </p>
      </div>

      {/* Section: Qué es */}
      <h2 className="mb-3 text-xl font-bold text-gray-900">¿Qué es la vista pública?</h2>
      <p className="mb-4 text-sm text-gray-600">
        Cuando el administrador publica un evento, el sistema genera una URL única del estilo:
      </p>
      <div className="mb-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 font-mono text-sm text-gray-600">
        https://tu-dominio.org/resultados/<span className="text-[#622599]">abc123xyz</span>
      </div>
      <p className="text-sm text-gray-600">
        Cualquiera que tenga ese link puede ver los resultados — sin crear cuenta ni iniciar sesión.
      </p>

      {/* Section: Cómo obtenerlo */}
      <h2 className="mb-3 mt-8 text-xl font-bold text-gray-900">¿Cómo obtener el link?</h2>
      <p className="mb-4 text-sm text-gray-600">
        Solo el administrador del distrito puede generarlo. El proceso es:
      </p>
      <ol className="mb-4 space-y-3 text-sm text-gray-600">
        {[
          "El administrador cierra el evento (todos los puntajes enviados).",
          'El administrador hace clic en "Publicar" en el detalle del evento.',
          'El sistema genera el link público. El administrador lo copia y lo comparte.',
        ].map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-600">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <Callout type="tip">
        ¿No tenés el link? Pedíselo al administrador del distrito o buscá el botón
        <strong> &ldquo;Ver resultados públicos&rdquo;</strong> dentro del evento si tenés una cuenta.
      </Callout>

      {/* Section: Qué muestra */}
      <h2 className="mb-3 mt-8 text-xl font-bold text-gray-900">¿Qué muestra la página?</h2>
      <ul className="mb-4 space-y-2 text-sm text-gray-600">
        {[
          "Nombre del evento y del distrito.",
          "Podio con las 3 primeras patrullas.",
          "Ranking completo: posición, nombre de patrulla, puntaje total.",
          "Detalle por actividad para cada patrulla.",
        ].map((item) => (
          <li key={item} className="flex gap-2">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {item}
          </li>
        ))}
      </ul>

      {/* Section: Compartir */}
      <h2 className="mb-3 mt-8 text-xl font-bold text-gray-900">Compartir los resultados</h2>
      <p className="mb-4 text-sm text-gray-600">
        Copiá el link y compartilo por WhatsApp, email, grupo de padres o redes sociales.
        El link permanece activo hasta que el administrador lo rote.
      </p>
      <Callout type="important">
        Si el administrador rota el link (genera uno nuevo), el link anterior deja de funcionar.
        Compartí siempre el link más reciente.
      </Callout>
    </div>
  )
}
