# Parte del subsistema offline del juez

Las vistas y componentes de este directorio se renderizan dentro del SPA catch-all `/juez/[[...slug]]` y leen datos del snapshot de IndexedDB. Antes de modificar cualquier archivo acá, leer:

- `src/lib/offline/CLAUDE.md` — convenciones #27–36 y #50 del subsistema.
- `docs/adr/0004-modo-offline-pwa-spa.md` — arquitectura completa y reglas permanentes.

Invariante crítico: para navegar usar solo `useJuezRouter().navigate()` o `JuezLink`, nunca `router.push()` de Next.js (convención #50).
