export function ResultadosNotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-6xl font-black text-brand/20 mb-4">404</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          No encontramos resultados con este link
        </h1>
        <p className="text-gray-500 max-w-sm mx-auto">
          El link puede ser incorrecto o el evento no está disponible públicamente.
        </p>
      </div>
    </div>
  )
}
