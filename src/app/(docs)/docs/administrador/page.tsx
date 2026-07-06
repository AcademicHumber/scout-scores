import { Callout } from "@/components/docs/Callout"

export const metadata = {
  title: "Guía del Administrador — Puntajes Scout",
}

function SectionHeader({ number, title }: { number: number; title: string }) {
  return (
    <div className="mb-4 mt-10 flex items-center gap-3 first:mt-0">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#622599] text-xs font-bold text-white">
        {number}
      </span>
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
    </div>
  )
}

export default function AdminPage() {
  return (
    <div>
      {/* Page header */}
      <div className="mb-8 border-b border-gray-100 pb-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#622599]">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </span>
          <span className="text-sm font-semibold text-[#622599]">Administrador</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Guía del Administrador</h1>
        <p className="mt-2 text-base text-gray-500">
          Todo lo que necesitás saber para configurar un evento de puntajes, desde crear el distrito hasta publicar los resultados.
        </p>
      </div>

      {/* Section 1 */}
      <SectionHeader number={1} title="Crear tu distrito" />
      <p className="mb-3 text-sm text-gray-600">
        La primera vez que ingresás al sistema, el sitio te redirige al <strong>onboarding</strong>.
        Escribí el nombre de tu distrito y hacé clic en <strong>&ldquo;Crear distrito&rdquo;</strong>.
        Este paso es único — una vez creado, el distrito es tu espacio de trabajo.
      </p>
      <Callout type="tip">
        El nombre del distrito aparece en la vista pública de resultados. Usá el nombre oficial del distrito scout.
      </Callout>
      <p className="mt-3 text-sm text-gray-600">
        Para navegar entre las secciones del panel, usá la barra de pestañas que aparece debajo del encabezado
        (Distrito, Grupos, Invitaciones, Miembros, Plantillas, Postas, Eventos).
        En celular, si no ves el encabezado del panel, tocá el ícono <strong>≡</strong> en la esquina
        superior derecha para abrir el menú y seleccionar <strong>Administración</strong>.
      </p>

      {/* Section 2 */}
      <SectionHeader number={2} title="Invitar al equipo" />
      <p className="mb-3 text-sm text-gray-600">
        Andá a <strong>Admin → Invitaciones → Nueva invitación</strong>. Ingresá el correo electrónico
        de la persona y seleccioná su rol:
      </p>
      <div className="mb-4 overflow-hidden rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5">Rol</th>
              <th className="px-4 py-2.5">Qué puede hacer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {[
              { role: "Administrador", desc: "Acceso total: gestiona eventos, plantillas, grupos y miembros." },
              { role: "Juez", desc: "Carga puntajes en las postas que le asignaste." },
              { role: "Jefe de Patrulla", desc: "Ve los resultados de su patrulla en el leaderboard." },
              { role: "Espectador", desc: "Ve el leaderboard en tiempo real, sin poder modificar nada." },
            ].map((row) => (
              <tr key={row.role} className="text-gray-600">
                <td className="px-4 py-2.5 font-medium text-gray-800">{row.role}</td>
                <td className="px-4 py-2.5">{row.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-gray-600">
        El sistema genera un link de invitación que podés copiar y enviar por WhatsApp o email.
        La invitación expira en 7 días. La persona puede usar Google o crear una cuenta con email.
      </p>

      {/* Section 3 */}
      <SectionHeader number={3} title="Gestionar grupos scouts" />
      <p className="text-sm text-gray-600">
        Andá a <strong>Admin → Grupos → Nuevo grupo</strong>. Cada grupo representa una unidad
        permanente de tu distrito (ej: 1° Grupo Scout Esperanza). Las patrullas de cada evento
        se asocian a un grupo.
      </p>

      {/* Section 4 */}
      <SectionHeader number={4} title="Plantillas de puntaje" />
      <p className="mb-3 text-sm text-gray-600">
        Andá a <strong>Admin → Plantillas → Nueva plantilla</strong>. Una plantilla define cómo
        se puntúa una actividad. Elegí el modo:
      </p>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {[
          {
            title: "CRITERIOS",
            desc: "El juez evalúa varios aspectos por separado. Cada criterio tiene una escala discreta (ej: 0 / 1 / 2 / 3).",
          },
          {
            title: "PUNTAJE ÚNICO",
            desc: "El juez ingresa un único número como puntaje total de la patrulla en esa posta.",
          },
        ].map((m) => (
          <div key={m.title} className="rounded-lg border border-gray-200 p-4">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#622599]">{m.title}</p>
            <p className="text-sm text-gray-600">{m.desc}</p>
          </div>
        ))}
      </div>
      <p className="mb-3 text-sm text-gray-600">
        Para el modo CRITERIOS, cada criterio puede ser:
      </p>
      <ul className="mb-4 space-y-1.5 text-sm text-gray-600">
        <li className="flex gap-2">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#622599]" />
          <span><strong>PUNTUABLE</strong> — suma al puntaje total del evento.</span>
        </li>
        <li className="flex gap-2">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-gray-400" />
          <span><strong>DESEMPATE</strong> — solo se usa para romper empates; no suma al total.</span>
        </li>
      </ul>
      <Callout type="tip">
        Las plantillas son reutilizables entre eventos. Creá una vez, usala en todos los años.
      </Callout>

      {/* Section 5 */}
      <SectionHeader number={5} title="Crear un evento" />
      <p className="mb-3 text-sm text-gray-600">
        Andá a <strong>Admin → Eventos → Nuevo evento</strong>. Ingresá el nombre del evento
        (ej: Jornada Distrital 2026) y después agregá las <strong>actividades</strong>.
      </p>
      <p className="mb-3 text-sm text-gray-600">
        Cada actividad tiene un <strong>peso porcentual</strong> que indica cuánto aporta al
        puntaje total. La suma de todos los pesos debe ser exactamente <strong>100%</strong>.
      </p>
      <p className="mb-3 text-sm text-gray-600">
        Al crear la actividad también elegís su <strong>plantilla de puntaje</strong>. Todas las
        postas que asignes a esa actividad se puntúan con esa misma plantilla — no hace falta
        elegirla de nuevo por cada posta.
      </p>
      <Callout type="important">
        Ejemplo: Mañana (40%) + Tarde (40%) + Noche (20%) = 100%. Si la suma no cierra,
        el botón <strong>&ldquo;Activar&rdquo;</strong> mostrará un error.
      </Callout>

      {/* Section 6 */}
      <SectionHeader number={6} title="Biblioteca de postas" />
      <p className="mb-3 text-sm text-gray-600">
        Antes de asignar postas a actividades, creá tus postas en <strong>Admin → Postas → Nueva posta</strong>.
        Cada posta tiene nombre, descripción, duración estimada y materiales necesarios.
      </p>
      <p className="mb-3 text-sm text-gray-600">
        Las postas viven en tu biblioteca del distrito y pueden reutilizarse en distintos eventos.
        El historial de usos aparece en el detalle de cada posta.
      </p>
      <p className="text-sm text-gray-600">
        Una vez que la posta está asignada a una actividad, en su página de detalle podés cargar la{" "}
        <strong>leyenda de puntajes</strong>: qué significa cada valor posible de la escala para esa
        posta puntual (ej. &ldquo;10 = llegó primero&rdquo;). Esa leyenda se le muestra al juez al
        cargar la planilla.
      </p>

      {/* Section 7 */}
      <SectionHeader number={7} title="Configurar postas y jueces en el evento" />
      <p className="mb-3 text-sm text-gray-600">
        Abrí el evento y, dentro de cada actividad, hacé clic en <strong>&ldquo;Asignar posta&rdquo;</strong>{" "}
        para elegir una de la biblioteca. Después de asignarla, configurá:
      </p>
      <ul className="mb-4 space-y-1.5 text-sm text-gray-600">
        <li className="flex gap-2">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#622599]" />
          <strong>Juez asignado</strong> — el miembro con rol JUEZ que va a cargar los puntajes (requerido).
        </li>
        <li className="flex gap-2">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-gray-300" />
          Encargado y ayudantes (opcionales).
        </li>
      </ul>

      {/* Section 8 */}
      <SectionHeader number={8} title="Agregar patrullas" />
      <p className="text-sm text-gray-600">
        En el evento, buscá la sección <strong>Patrullas</strong> y hacé clic en{" "}
        <strong>&ldquo;Nueva patrulla&rdquo;</strong>. Asignale un nombre y el grupo scout al que pertenece.
        Agregá todas las patrullas participantes antes de activar el evento.
      </p>

      {/* Section 9 */}
      <SectionHeader number={9} title="Activar el evento" />
      <p className="mb-3 text-sm text-gray-600">
        Cuando todo esté configurado, hacé clic en <strong>&ldquo;Activar&rdquo;</strong>. El sistema verifica:
      </p>
      <ul className="mb-4 space-y-1.5 text-sm text-gray-600">
        {[
          "Las actividades suman exactamente 100%.",
          "Cada actividad tiene una plantilla de puntaje asignada.",
          "Cada actividad tiene al menos una posta asignada.",
          "Hay al menos una patrulla.",
        ].map((check) => (
          <li key={check} className="flex gap-2">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#622599]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>{check}</span>
          </li>
        ))}
      </ul>
      <Callout type="important">
        Una vez activado, la estructura del evento queda bloqueada: no podés agregar ni quitar postas
        ni patrullas. Los jueces ya pueden empezar a cargar puntajes.
      </Callout>

      {/* Section 10 */}
      <SectionHeader number={10} title="Durante el evento — seguimiento de planillas" />
      <p className="mb-3 text-sm text-gray-600">
        Andá a <strong>Admin → Eventos → [evento] → Planillas</strong>. Vas a ver el estado de
        cada planilla (juez × patrulla × posta):
      </p>
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {[
          { label: "Pendiente", color: "bg-gray-100 text-gray-600" },
          { label: "Borrador guardado", color: "bg-amber-100 text-amber-700" },
          { label: "Enviado", color: "bg-green-100 text-green-700" },
        ].map((s) => (
          <span key={s.label} className={`rounded-full px-3 py-1 font-medium ${s.color}`}>{s.label}</span>
        ))}
      </div>
      <p className="text-sm text-gray-600">
        Si un juez cometió un error, podés hacer clic en <strong>&ldquo;Reabrir planilla&rdquo;</strong>{" "}
        para que pueda corregirla. La planilla vuelve al estado Borrador.
      </p>

      {/* Section 11 */}
      <SectionHeader number={11} title="Cerrar el evento" />
      <p className="text-sm text-gray-600">
        Cuando todos los jueces enviaron sus planillas, hacé clic en <strong>&ldquo;Cerrar&rdquo;</strong>.
        El sistema verifica que todas las planillas estén en estado <em>Enviado</em>. Si alguna
        falta, aparece un listado con las pendientes. Un evento cerrado ya no admite nuevos puntajes.
      </p>

      {/* Section 12 */}
      <SectionHeader number={12} title="Publicar y compartir resultados" />
      <p className="mb-3 text-sm text-gray-600">
        Con el evento cerrado, hacé clic en <strong>&ldquo;Publicar&rdquo;</strong>. El sistema genera el
        snapshot final del leaderboard y un link público que podés compartir con quien quieras,
        sin que necesiten una cuenta.
      </p>
      <Callout type="tip">
        Si reabriste una planilla después de publicar, el sistema te avisa que el snapshot está
        desactualizado. Volvé a publicar para regenerarlo. Podés también rotar el link si querés
        que el anterior deje de funcionar.
      </Callout>
    </div>
  )
}
