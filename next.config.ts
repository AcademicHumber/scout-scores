import type { NextConfig } from "next"
import withSerwist from "@serwist/next"

// NEXT_STANDALONE=true se setea en Dockerfile y CI. En Windows, crear
// symlinks para el standalone output requiere Developer Mode o Admin — omitir
// en builds locales donde solo queremos verificar que compila.
//
// En el Docker build también se omiten typecheck y lint: el CI los corre por
// separado. El VPS tiene poca RAM y el proceso TypeScript puede OOM durante
// `next build` si se deja correr — el kernel lo mata sin mensaje de error claro.
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
        // Typecheck y lint los corre el CI. Acá solo nos importa el bundle.
        typescript: { ignoreBuildErrors: true },
        eslint: { ignoreDuringBuilds: true },
      }
    : {}

const nextConfig: NextConfig = {
  ...standaloneConfig,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ]
  },
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
