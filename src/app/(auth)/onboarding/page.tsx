import { createDistrito, aceptarInvitacion } from "./actions"
import messages from "@/messages/es.json"

const m = messages.auth.onboarding

export default function OnboardingPage() {
  return (
    <div className="w-full max-w-2xl space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">{m.title}</h1>
        <p className="mt-1 text-sm text-gray-500">{m.subtitle}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Crear nuevo Distrito */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {m.createDistrito.title}
            </h2>
            <p className="mt-1 text-sm text-gray-500">{m.createDistrito.description}</p>
          </div>

          <form action={createDistrito} className="space-y-3">
            <div>
              <label
                htmlFor="nombre"
                className="block text-sm font-medium text-gray-700"
              >
                {m.createDistrito.nombreLabel}
              </label>
              <input
                id="nombre"
                name="nombre"
                type="text"
                required
                minLength={2}
                maxLength={100}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="slug"
                className="block text-sm font-medium text-gray-700"
              >
                {m.createDistrito.slugLabel}
              </label>
              <input
                id="slug"
                name="slug"
                type="text"
                required
                minLength={2}
                maxLength={50}
                pattern="[a-z0-9-]+"
                placeholder="mi-distrito"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              {m.createDistrito.submit}
            </button>
          </form>
        </div>

        {/* Código de invitación */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {m.joinDistrito.title}
            </h2>
            <p className="mt-1 text-sm text-gray-500">{m.joinDistrito.description}</p>
          </div>

          <form action={aceptarInvitacion} className="space-y-3">
            <div>
              <label
                htmlFor="token"
                className="block text-sm font-medium text-gray-700"
              >
                {m.joinDistrito.tokenLabel}
              </label>
              <input
                id="token"
                name="token"
                type="text"
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
            >
              {m.joinDistrito.submit}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
