import { StepList } from "@/components/docs/StepList"
import { Callout } from "@/components/docs/Callout"

export const metadata = {
  title: "Instalar la app — Puntajes Scout",
}

export default function InstalarAppPage() {
  return (
    <div>
      {/* Page header */}
      <div className="mb-8 border-b border-gray-100 pb-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#622599]">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </span>
          <span className="text-sm font-semibold text-[#622599]">Instalación</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Instalar la app en tu celular</h1>
        <p className="mt-2 text-base text-gray-500">
          Puntajes Scout es una PWA (Progressive Web App): se instala desde el navegador, sin pasar por la App Store ni Google Play,
          y funciona como una app nativa con soporte offline.
        </p>
      </div>

      <Callout type="tip">
        Instalá la app <strong>antes del evento</strong> mientras tenés internet. Así las páginas quedan
        disponibles sin conexión cuando estés en el campo.
      </Callout>

      {/* iOS */}
      <h2 className="mb-1 mt-10 text-2xl font-bold text-gray-900">iPhone / iPad (iOS)</h2>
      <p className="mb-6 text-sm text-gray-500">iOS 16.4 o superior recomendado.</p>

      <h3 className="mb-3 text-lg font-semibold text-gray-800">Safari</h3>
      <p className="mb-3 text-sm text-gray-600">
        Safari es el navegador con mejor soporte de PWA en iOS. Es el método recomendado en iPhone.
      </p>
      <StepList
        steps={[
          {
            title: "Abrí la app en Safari",
            children: "Ingresá a la URL del sistema desde Safari. Asegurate de estar en Safari y no en Chrome u otro navegador.",
          },
          {
            title: 'Tocá el botón Compartir',
            children: (
              <>
                En la barra inferior del navegador, tocá el ícono{" "}
                <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700">
                  □↑
                </span>{" "}
                (cuadrado con flecha hacia arriba).
              </>
            ),
          },
          {
            title: '"Agregar a pantalla de inicio"',
            children: 'Deslizá el menú hacia abajo y tocá "Agregar a pantalla de inicio". Confirmá con "Agregar".',
          },
          {
            title: "Listo",
            children: "El ícono de Puntajes Scout aparece en tu pantalla de inicio. Al abrirlo se lanza sin barra de navegación del browser.",
          },
        ]}
      />

      <h3 className="mb-3 mt-8 text-lg font-semibold text-gray-800">Chrome en iPhone (iOS 16.4+)</h3>
      <p className="mb-3 text-sm text-gray-600">
        A partir de iOS 16.4, Chrome también puede instalar PWAs en iPhone.
      </p>
      <StepList
        steps={[
          {
            title: "Abrí la app en Chrome",
            children: "Ingresá a la URL del sistema desde Chrome para iOS.",
          },
          {
            title: 'Tocá el menú (⋯) o el botón Compartir',
            children: "Tocá los tres puntos en la esquina inferior derecha, o el ícono de compartir.",
          },
          {
            title: '"Agregar a pantalla de inicio"',
            children: 'Seleccioná "Agregar a pantalla de inicio" y confirmá con "Agregar".',
          },
        ]}
      />
      <Callout type="important">
        En versiones de iOS anteriores a 16.4, <strong>solo Safari</strong> permite instalar PWAs.
        Chrome y Firefox en esas versiones no tienen la opción de instalación.
      </Callout>

      {/* Android */}
      <h2 className="mb-1 mt-12 text-2xl font-bold text-gray-900">Android</h2>
      <p className="mb-6 text-sm text-gray-500">Android 8 o superior recomendado.</p>

      <h3 className="mb-3 text-lg font-semibold text-gray-800">Chrome (recomendado)</h3>
      <p className="mb-3 text-sm text-gray-600">
        Chrome es el navegador predeterminado en la mayoría de los Android y tiene el mejor soporte de PWA.
      </p>
      <StepList
        steps={[
          {
            title: "Abrí la app en Chrome",
            children: (
              <>Ingresá a la URL del sistema. Puede aparecer automáticamente un banner en la parte inferior que dice &ldquo;Agregar a pantalla de inicio&rdquo; — si aparece, tocalo directamente.</>
            ),
          },
          {
            title: "Si no apareció el banner, abrí el menú",
            children: (
              <>
                Tocá los tres puntos{" "}
                <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700">
                  ⋮
                </span>{" "}
                en la esquina superior derecha del navegador.
              </>
            ),
          },
          {
            title: '"Agregar a pantalla de inicio" o "Instalar app"',
            children: 'Seleccioná "Instalar app" (Chrome moderno) o "Agregar a pantalla de inicio". Confirmá en el diálogo que aparece.',
          },
          {
            title: "Listo",
            children: "La app queda en tu pantalla de inicio y en el cajón de apps. Se abre en pantalla completa sin barra del browser.",
          },
        ]}
      />

      <h3 className="mb-3 mt-8 text-lg font-semibold text-gray-800">Samsung Internet</h3>
      <p className="mb-3 text-sm text-gray-600">
        El navegador predeterminado en dispositivos Samsung.
      </p>
      <StepList
        steps={[
          {
            title: "Abrí la app en Samsung Internet",
            children: "Ingresá a la URL del sistema.",
          },
          {
            title: "Tocá el ícono del menú",
            children: "Tocá las tres líneas horizontales en la esquina inferior derecha.",
          },
          {
            title: '"Agregar página a" → "Pantalla de inicio"',
            children: 'Seleccioná "Agregar página a" y luego "Pantalla de inicio". Confirmá con "Agregar".',
          },
        ]}
      />

      <h3 className="mb-3 mt-8 text-lg font-semibold text-gray-800">Firefox en Android</h3>
      <StepList
        steps={[
          {
            title: "Abrí la app en Firefox",
            children: "Ingresá a la URL del sistema.",
          },
          {
            title: "Tocá el menú (⋯)",
            children: "Tocá los tres puntos en la esquina inferior derecha.",
          },
          {
            title: '"Instalar" o "Agregar a pantalla de inicio"',
            children: 'Seleccioná "Instalar" si aparece, o "Agregar a pantalla de inicio". Confirmá en el diálogo.',
          },
        ]}
      />

      {/* After install */}
      <h2 className="mb-4 mt-12 text-xl font-bold text-gray-900">Después de instalar</h2>
      <div className="space-y-3">
        {[
          {
            title: "Iniciá sesión mientras tenés internet",
            body: "La primera vez que abrís la app instalada, iniciá sesión con tu cuenta. La sesión se mantiene activa por 7 días.",
          },
          {
            title: "Navegá las páginas que vas a usar offline",
            body: "Abrí los eventos y las postas que te corresponden. El service worker las almacena en caché para que estén disponibles sin señal.",
          },
          {
            title: "La app funciona sin conexión",
            body: "Los puntajes que cargues sin internet se guardan en el dispositivo y se envían solos cuando volvés a tener señal.",
          },
        ].map((item) => (
          <div key={item.title} className="rounded-xl border border-gray-200 p-4">
            <p className="mb-1 font-medium text-gray-800">{item.title}</p>
            <p className="text-sm text-gray-600">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
