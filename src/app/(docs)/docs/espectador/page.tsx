import { Callout } from "@/components/docs/Callout"

export const metadata = {
  title: "Guía del Espectador — Puntajes Scout",
}

export default function EspectadorPage() {
  return (
    <div>
      {/* Page header */}
      <div className="mb-8 border-b border-gray-100 pb-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </span>
          <span className="text-sm font-semibold text-sky-700">Espectador</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Guía del Espectador</h1>
        <p className="mt-2 text-base text-gray-500">
          Cómo seguir el leaderboard en tiempo real durante el evento.
        </p>
      </div>

      {/* Section: Acceder */}
      <h2 className="mb-3 text-xl font-bold text-gray-900">Acceder al sistema</h2>
      <p className="mb-4 text-sm text-gray-600">
        El administrador del distrito te invitó con el rol <strong>Espectador</strong>. Aceptá
        la invitación con tu cuenta de Google o creá una con email. Desde el inicio ves los
        eventos del distrito.
      </p>

      {/* Section: Ver leaderboard */}
      <h2 className="mb-3 mt-8 text-xl font-bold text-gray-900">Ver el leaderboard en tiempo real</h2>
      <p className="mb-4 text-sm text-gray-600">
        Tocá un evento activo y después <strong>&ldquo;Ver resultados&rdquo;</strong>. El ranking se actualiza
        automáticamente a medida que los jueces envían sus planillas. No hace falta recargar.
      </p>
      <Callout type="tip">
        Los puntajes aparecen a medida que se cargan. Al principio del evento la tabla puede estar
        incompleta — es normal. El ranking final se consolida cuando el administrador cierra el evento.
      </Callout>

      {/* Section: Qué podés hacer */}
      <h2 className="mb-3 mt-8 text-xl font-bold text-gray-900">Qué podés hacer</h2>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700">Podés</p>
          <ul className="space-y-1.5 text-sm text-gray-700">
            {[
              "Ver el ranking de todas las patrullas.",
              "Ver el detalle por actividad.",
              "Ver los resultados de eventos cerrados y publicados.",
              "Acceder al link público compartible.",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-rose-700">No podés</p>
          <ul className="space-y-1.5 text-sm text-gray-700">
            {[
              "Cargar ni modificar puntajes.",
              "Crear o editar eventos.",
              "Gestionar invitaciones o miembros.",
              "Ver datos de otros distritos.",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Section: Link público */}
      <h2 className="mb-3 mt-8 text-xl font-bold text-gray-900">Link público de resultados</h2>
      <p className="text-sm text-gray-600">
        Cuando el administrador publica el evento, genera un link público. Ese link no requiere
        cuenta y podés compartirlo con familias y participantes. Lo encontrás dentro del evento,
        en la sección de resultados, como <strong>&ldquo;Ver resultados públicos&rdquo;</strong>.
      </p>
    </div>
  )
}
