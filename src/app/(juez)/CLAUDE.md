# Parte del subsistema offline del juez

Este route group pertenece al subsistema offline (PWA + IndexedDB + SPA catch-all). Antes de modificar cualquier archivo acá, leer:

- `src/lib/offline/CLAUDE.md` — convenciones #27–36 y #50 del subsistema.
- `docs/adr/0004-modo-offline-pwa-spa.md` — arquitectura completa y reglas permanentes.

Invariante crítico: dentro de `/juez/**` el router de Next.js NO navega el SPA — solo `useJuezRouter().navigate()` o `JuezLink` (convención #50).
