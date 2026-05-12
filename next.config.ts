import type { NextConfig } from "next"
import withSerwist from "@serwist/next"

// NEXT_STANDALONE=true se setea en Dockerfile y CI. En Windows, crear
// symlinks para el standalone output requiere Developer Mode o Admin — omitir
// en builds locales donde solo queremos verificar que compila.
const standaloneConfig =
  process.env.NEXT_STANDALONE === "true"
    ? {
        output: "standalone" as const,
        // El cliente Prisma generado vive en src/generated/prisma. Next trace lo
        // detecta como código de la app, pero sus archivos auxiliares (engine
        // schema, runtime helpers) pueden no entrar en el trace. Forzar inclusión.
        outputFileTracingIncludes: {
          "/*": ["./src/generated/prisma/**/*"],
        },
      }
    : {}

const nextConfig: NextConfig = {
  ...standaloneConfig,
}

// withSerwist injects webpack config even when disable:true, which triggers
// "Webpack configured but Turbopack is not" warnings in dev. Skip the
// wrapper entirely in development so Turbopack runs without interference.
export default process.env.NODE_ENV === "development"
  ? nextConfig
  : withSerwist({
      swSrc: "src/app/sw.ts",
      swDest: "public/sw.js",
    })(nextConfig)
