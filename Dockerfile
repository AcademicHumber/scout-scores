# syntax=docker/dockerfile:1.7

# ----------------------------------------------------------------------------
# Stage: deps — instala node_modules con pnpm. Cacheable mientras no cambie
# pnpm-lock.yaml ni package.json.
# ----------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# Corepack viene con Node 22; pin a la version del packageManager field.
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Solo lockfile + manifest para maximizar cache.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ----------------------------------------------------------------------------
# Stage: builder — copia el source completo, genera Prisma client y construye
# la app de Next con output standalone. Esta stage también la usa el servicio
# `migrate` para correr `prisma migrate deploy` (tiene Prisma CLI instalado).
# ----------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Reusar node_modules del stage deps.
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generar el cliente Prisma. El output va a src/generated/prisma según schema.
RUN pnpm prisma generate

# DATABASE_URL no es necesaria en build (no se ejecuta SQL durante next build),
# pero algunos imports a runtime config la pueden requerir. Pasar dummy si falla.
# NEXT_STANDALONE=true activa output:standalone en next.config.ts (no se usa en
# builds locales Windows porque crear symlinks requiere Developer Mode).
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_STANDALONE=true
RUN pnpm build

# ----------------------------------------------------------------------------
# Stage: runner — imagen final mínima. Solo lo que server.js necesita.
# ----------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Usuario no-root para correr la app.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs

# Standalone produce server.js + node_modules tracados en .next/standalone/.
# public/ y .next/static/ no se copian automáticamente — hay que hacerlo a mano.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

# Healthcheck Docker-nativo (compose lo usa también).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
