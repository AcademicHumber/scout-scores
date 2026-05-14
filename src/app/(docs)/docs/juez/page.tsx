import { StepList } from "@/components/docs/StepList"
import { Callout } from "@/components/docs/Callout"

export const metadata = {
  title: "Guía del Juez — Puntajes Scout",
}

export default function JuezPage() {
  return (
    <div>
      {/* Page header */}
      <div className="mb-8 border-b border-gray-100 pb-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </span>
          <span className="text-sm font-semibold text-amber-700">Juez</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Guía del Juez</h1>
        <p className="mt-2 text-base text-gray-500">
          Cómo cargar puntajes en tus postas asignadas, trabajar sin internet y resolver situaciones comunes durante el evento.
        </p>
      </div>

      {/* Section: Acceder */}
      <h2 className="mb-4 text-xl font-bold text-gray-900">Acceder al sistema</h2>
      <p className="mb-4 text-sm text-gray-600">
        El administrador del distrito te envió una invitación por email con un link. Al abrirlo, podés registrarte con
        tu cuenta de Google o crear una cuenta con email y contraseña. Una vez adentro, el sistema ya sabe qué postas te corresponden.
      </p>
      <Callout type="tip">
        Si el administrador te dio la URL del sistema directamente, ingresá a esa dirección y
        hacé clic en <strong>&ldquo;Iniciar sesión&rdquo;</strong>.
      </Callout>

      {/* Section: Ver eventos */}
      <h2 className="mb-4 mt-8 text-xl font-bold text-gray-900">Ver tus eventos y postas</h2>
      <p className="mb-4 text-sm text-gray-600">
        Al entrar, ves la lista de eventos activos donde tenés postas asignadas. Tocá el evento para ver
        las postas que te corresponden. Tocá una posta para empezar a cargar puntajes.
      </p>

      {/* Section: CRITERIOS */}
      <h2 className="mb-3 mt-8 text-xl font-bold text-gray-900">Cargar puntaje — modo CRITERIOS</h2>
      <p className="mb-4 text-sm text-gray-600">
        En este modo evaluás varios aspectos de la patrulla por separado.
      </p>
      <StepList
        steps={[
          {
            title: "Seleccioná la patrulla",
            children: "En la posta, vas a ver la lista de patrullas participantes. Tocá la que vas a evaluar.",
          },
          {
            title: "Evaluá cada criterio",
            children: (
              <>
                Para cada criterio, seleccioná el valor en la escala (ej: 0 / 1 / 2 / 3).
                Podés dejar criterios sin completar y guardar un borrador.
              </>
            ),
          },
          {
            title: "Guardá el borrador (opcional)",
            children: 'Si necesitás interrumpir la evaluación, tocá "Guardar borrador". Los datos quedan guardados y podés retomar después.',
          },
          {
            title: "Enviá la planilla",
            children: (
              <>
                Cuando completaste todos los criterios, tocá <strong>&ldquo;Enviar planilla&rdquo;</strong>. Una vez enviada no podés
                modificarla — a menos que el administrador la reabra.
              </>
            ),
          },
        ]}
      />

      {/* Section: PUNTAJE_ÚNICO */}
      <h2 className="mb-3 mt-8 text-xl font-bold text-gray-900">Cargar puntaje — modo PUNTAJE ÚNICO</h2>
      <p className="mb-4 text-sm text-gray-600">
        En este modo ingresás un único número como puntaje total de la patrulla.
      </p>
      <StepList
        steps={[
          {
            title: "Seleccioná la patrulla",
            children: "Tocá la patrulla que vas a evaluar.",
          },
          {
            title: "Ingresá el puntaje",
            children: "Escribí el valor numérico. Podés agregar un comentario opcional.",
          },
          {
            title: "Enviá la planilla",
            children: 'Tocá "Enviar planilla" para confirmar.',
          },
        ]}
      />

      {/* Section: Offline */}
      <h2 className="mb-3 mt-8 text-xl font-bold text-gray-900">Trabajar sin internet</h2>
      <p className="mb-4 text-sm text-gray-600">
        La app funciona sin conexión. Si perdés señal durante el evento:
      </p>
      <ul className="mb-4 space-y-2 text-sm text-gray-600">
        {[
          "Tus cambios se guardan automáticamente en el dispositivo.",
          "Un indicador en el encabezado muestra cuántas operaciones están pendientes de enviar.",
          "Cuando volvés a tener señal, los puntajes se sincronizan solos en segundos.",
        ].map((item) => (
          <li key={item} className="flex gap-2">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {item}
          </li>
        ))}
      </ul>
      <Callout type="important">
        Visitá la app <strong>antes del evento</strong> mientras tenés internet para que las páginas
        queden disponibles offline. Si nunca abriste una página con red, no va a funcionar sin conexión.
      </Callout>

      {/* Section: Instalar */}
      <h2 className="mb-3 mt-8 text-xl font-bold text-gray-900">Instalar como app en el celular</h2>
      <p className="mb-3 text-sm text-gray-600">
        Instalala en la pantalla de inicio para acceder más rápido y que funcione como una app nativa:
      </p>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {[
          {
            title: "Android (Chrome)",
            steps: ['Tocá el menú (⋮)', '"Agregar a pantalla de inicio"'],
          },
          {
            title: "iPhone (Safari)",
            steps: ['Tocá el botón Compartir (□↑)', '"Agregar a pantalla de inicio"'],
          },
        ].map((device) => (
          <div key={device.title} className="rounded-xl border border-gray-200 p-4">
            <p className="mb-2 font-medium text-gray-800">{device.title}</p>
            <ol className="space-y-1 text-sm text-gray-600">
              {device.steps.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      {/* Section: Conflictos */}
      <h2 className="mb-3 mt-8 text-xl font-bold text-gray-900">Situaciones comunes</h2>
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="mb-1 font-medium text-gray-800">Aparece el banner &ldquo;Planilla reabierta&rdquo;</p>
          <p className="text-sm text-gray-600">
            El administrador reabrió tu planilla para que la corrijas. Revisá los criterios, editá
            lo necesario y volvé a enviarla.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="mb-1 font-medium text-gray-800">Aparece el banner &ldquo;Conflicto detectado&rdquo;</p>
          <p className="text-sm text-gray-600">
            Poco frecuente. Ocurre si enviaste una planilla offline y el admin la reabrió al mismo tiempo.
            Tu versión local tiene prioridad — revisá los datos y volvé a enviar.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="mb-1 font-medium text-gray-800">No veo el evento en la lista</p>
          <p className="text-sm text-gray-600">
            Solo aparecen los eventos en estado <em>Activo</em> donde el admin te asignó una posta.
            Si el evento no aparece, contactá al administrador.
          </p>
        </div>
      </div>
    </div>
  )
}
