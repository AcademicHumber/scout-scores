import { Callout } from "@/components/docs/Callout"

export const metadata = {
  title: "Guía del Jefe de Patrulla — Puntajes Scout",
}

export default function JefePatrullaPage() {
  return (
    <div>
      {/* Page header */}
      <div className="mb-8 border-b border-gray-100 pb-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </span>
          <span className="text-sm font-semibold text-emerald-700">Jefe de Patrulla</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Guía del Jefe de Patrulla</h1>
        <p className="mt-2 text-base text-gray-500">
          Cómo ver los resultados de tu patrulla y entender el leaderboard durante y después del evento.
        </p>
      </div>

      {/* Section: Acceder */}
      <h2 className="mb-3 text-xl font-bold text-gray-900">Acceder al sistema</h2>
      <p className="mb-4 text-sm text-gray-600">
        El administrador del distrito te envió un link de invitación. Al aceptarlo, registrate con
        Google o con email y contraseña. Desde el inicio vas a ver los eventos activos del distrito.
      </p>

      {/* Section: Ver resultados */}
      <h2 className="mb-3 mt-8 text-xl font-bold text-gray-900">Ver los resultados de tu patrulla</h2>
      <p className="mb-4 text-sm text-gray-600">
        En la pantalla de inicio aparecen los eventos. Tocá un evento y después
        hacé clic en <strong>&ldquo;Ver resultados&rdquo;</strong>. El leaderboard muestra el ranking de todas
        las patrullas. La tuya aparece <span className="font-medium text-emerald-700">destacada</span> para que la identifiques rápido.
      </p>
      <Callout type="tip">
        Los resultados se actualizan en tiempo real a medida que los jueces envían sus planillas.
        No hace falta recargar la página.
      </Callout>

      {/* Section: Entender el leaderboard */}
      <h2 className="mb-3 mt-8 text-xl font-bold text-gray-900">Entender el leaderboard</h2>
      <div className="mb-4 overflow-hidden rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5">Columna</th>
              <th className="px-4 py-2.5">Qué significa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-600">
            <tr>
              <td className="px-4 py-2.5 font-medium text-gray-800">Posición</td>
              <td className="px-4 py-2.5">Ranking de mayor a menor puntaje. Las patrullas empatadas comparten posición.</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium text-gray-800">Patrulla</td>
              <td className="px-4 py-2.5">Nombre de la patrulla y grupo scout al que pertenece.</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium text-gray-800">Puntaje total</td>
              <td className="px-4 py-2.5">Suma ponderada de todas las actividades según su peso porcentual.</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium text-gray-800">Por actividad</td>
              <td className="px-4 py-2.5">Columnas separadas para cada actividad del evento (ej: Mañana, Tarde).</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Callout type="tip">
        Los criterios de <strong>Desempate</strong> no aparecen en el puntaje total — solo se
        usan internamente para resolver empates entre patrullas con el mismo puntaje.
      </Callout>

      {/* Section: Link público */}
      <h2 className="mb-3 mt-8 text-xl font-bold text-gray-900">Ver el link público</h2>
      <p className="text-sm text-gray-600">
        Cuando el administrador publique los resultados finales, genera un link público que podés
        compartir con familiares y participantes sin que necesiten una cuenta. Pedíselo al administrador
        o buscá el botón <strong>&ldquo;Ver resultados públicos&rdquo;</strong> dentro del evento.
      </p>
    </div>
  )
}
