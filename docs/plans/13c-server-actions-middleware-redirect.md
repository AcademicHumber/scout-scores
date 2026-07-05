# Plan 13c — Server Actions interceptadas por el middleware de onboarding

**Estado:** completado
**Contexto:** bug reportado tras una prueba de uso real — al registrar una cuenta nueva por email/contraseña, llegar a `/onboarding` y hacer click en "Unirme como espectador" para un distrito, la app tiraba un Runtime Error: `An unexpected response was received from the server`, con el stack apuntando a `src/app/(auth)/onboarding/page.tsx:11`. Se investigó con logs de diagnóstico temporales y resultó ser una interacción entre el middleware de Auth.js y el mecanismo interno de Server Actions de Next.js — no un bug de la lógica de negocio del onboarding.

---

## Diagnóstico

### El mensaje de error es genérico y viene del cliente de Next.js, no de nuestro código

`"An unexpected response was received from the server"` está codificado en `node_modules/next/dist/client/components/router-reducer/reducers/server-action-reducer.js`. Next.js lo tira cuando la respuesta HTTP a una Server Action no tiene el shape esperado:

```js
const isRscResponse = !!(contentType && contentType.startsWith(RSC_CONTENT_TYPE_HEADER))
if (!isRscResponse && !redirectLocation) {
  const message = res.status >= 400 && contentType === 'text/plain'
    ? await res.text()
    : 'An unexpected response was received from the server.'
  throw new Error(message)
}
```

Es decir: la respuesta no era `content-type: text/x-component` (el formato RSC de una action) **y** tampoco traía el header `x-action-redirect` (cómo Next codifica un `redirect()` interno). Esto pasa cuando algo *externo* al mecanismo de actions — típicamente el middleware — intercepta el POST y devuelve un redirect HTTP normal, que el `fetch()` del cliente sigue automáticamente, terminando en el HTML de otra página.

### Reproducción con logs de diagnóstico

Se agregaron logs temporales en `unirseComoEspectador` (cada paso de la transacción) y en `authorized()` del middleware (cada rama de redirect, con `path` y `method`). El log revelador:

```
[middleware] sin membership, redirect a /onboarding { path: '/dashboard', method: 'POST' }
```

Un **POST a `/dashboard`** — pero el botón "Unirme como espectador" vive en `/onboarding` y su Server Action debería postear ahí. Esto confirma que el router del cliente de Next.js (que determina `canonicalUrl`, la URL contra la que se postea una Server Action) había quedado desincronizado en `/dashboard`, sobrante de la cadena de redirects del registro:

1. `signupAction` llama `signIn("credentials", { redirectTo: "/dashboard" })`.
2. El layout `(app)/layout.tsx` (vía `requireOrg()`) ve que la cuenta recién creada no tiene memberships y redirige a `/onboarding`.
3. El navegador termina mostrando `/onboarding` correctamente, pero el estado interno del router de Next (usado para futuras Server Actions) quedó apuntando al destino intermedio (`/dashboard`) en vez del final.
4. Al hacer click en "Unirme como espectador", la Server Action postea contra esa URL vieja (`/dashboard`).
5. El middleware evalúa `/dashboard`: hay sesión pero no hay membership, y `/dashboard` no empieza con `/onboarding` → aplica la regla `!hasMembership && !isOnboarding` → `Response.redirect("/onboarding")`, un redirect HTTP **crudo**, no el mecanismo de `x-action-redirect` que Next espera para una action.
6. El `fetch()` del cliente sigue ese redirect, recibe el HTML/RSC de `/onboarding` con un content-type que no matchea lo esperado para la respuesta de una action → `"unexpected response was received from the server"`.

### La causa no es específica de este flujo

Las reglas de `authorized()` que deciden "mandar a onboarding" o "mandar a dashboard" son guías de **navegación de páginas** (a dónde debería estar parado el usuario dado su estado de membership), pensadas para requests `GET` de navegación. No tienen relación con la seguridad de la request en sí — eso ya lo cubre la primera regla (`!auth?.user` → `/login`). Aplicarlas también a los POST de Server Actions es lo que rompe el mecanismo: cualquier flujo que encadene un redirect a `/dashboard` seguido de un redirect interno a `/onboarding` (por ejemplo, alta nueva vía Google, que usa el mismo `redirectTo: "/dashboard"` en `src/app/(auth)/login/page.tsx`) puede sufrir el mismo desync, aunque solo se haya reproducido y confirmado con el flujo de credenciales.

## Decisiones técnicas

| Decisión | Opción elegida | Por qué |
|---|---|---|
| **¿Cómo evitar que el middleware intercepte Server Actions?** | Detectar el header `next-action` (que Next.js agrega a todo POST de action) y devolver `true` sin evaluar las reglas de onboarding/dashboard | Es la única señal confiable y ya provista por el framework para distinguir "esto es una Server Action" de una navegación normal. No depende de heurísticas de URL. |
| **¿Sacar también la regla de auth (`!auth?.user`) para Server Actions?** | No, se mantiene | Es un gate de seguridad real (sesión inexistente), no una guía de navegación. Si de verdad no hay sesión, la action tampoco debería poder ejecutar — dejarla intercepta el caso legítimo de sesión expirada a mitad de página. |
| **¿Arreglar el desync del router en sí (causa de fondo en Next.js)?** | No — se lo esquiva | Es un comportamiento del App Router de Next.js sobre cadenas de redirect anidados, no algo parcheable desde el código de la app. La mitigación (no aplicar las reglas de navegación a las actions) es suficiente y además es la corrección arquitectónicamente correcta independientemente del bug puntual. |
| **¿`redirectTo` de `signupAction`: `/dashboard` o `/onboarding` directo?** | `/onboarding` directo | Una cuenta de credenciales recién creada siempre tiene cero memberships — pasar por `/dashboard` es un rebote innecesario que además fue la fuente concreta del desync reproducido. No se tocó el `redirectTo` de Google (`login/page.tsx`) porque ahí no se sabe de antemano si la cuenta es nueva o existente antes de completar el OAuth. |
| **¿Agregar `/manifest.webmanifest` a `PUBLIC_PATHS`?** | Sí | Se notó en los mismos logs: una request sin sesión a `/manifest.webmanifest` rebotaba a `/login`, devolviendo HTML en vez del manifest. No es la causa del bug principal, pero es incorrecto que un archivo público de la PWA dependa de autenticación. |

## Cambios por archivo

### 1. `src/auth.config.ts`

- `authorized()`: nueva rama `if (request.headers.has("next-action")) return true` entre el chequeo de sesión y las reglas de onboarding/dashboard.
- `PUBLIC_PATHS`: se agrega `/manifest.webmanifest`.

### 2. `src/app/(auth)/registro/actions.ts`

`signIn("credentials", { ..., redirectTo: "/dashboard" })` → `redirectTo: "/onboarding"`.

### 3. `src/app/(auth)/onboarding/actions.ts`

Se retiraron los `console.log`/`console.error` de diagnóstico agregados durante la investigación (la lógica de `unirseComoEspectador` no cambió).

## Tareas

- [x] 1. Agregar logs de diagnóstico temporales (middleware + `unirseComoEspectador`)
- [x] 2. Reproducir y confirmar la causa con los logs
- [x] 3. `authorized()` — bypass para Server Actions vía header `next-action`
- [x] 4. `signupAction` — `redirectTo` directo a `/onboarding`
- [x] 5. Retirar los logs de diagnóstico
- [x] 6. `PUBLIC_PATHS` — agregar `/manifest.webmanifest`
- [x] 7. `pnpm typecheck`, `pnpm lint` y `pnpm test` (115 tests) — sin errores

## Lecciones aprendidas

### #1 — El middleware de Auth.js corre sobre *todas* las requests, incluidas las Server Actions

Las reglas de `authorized()` se escribieron pensando en navegaciones `GET` (a dónde redirigir según el estado de membership), pero el matcher del middleware (`config.matcher` en `src/middleware.ts`) no distingue método HTTP ni tipo de request — corre igual sobre el POST que dispara una Server Action. Cualquier regla de redirect basada en la URL de la request puede terminar interceptando una action si su `canonicalUrl` no coincide con lo que el middleware espera.

**Regla**: antes de agregar una regla de redirect al `authorized()` callback, preguntarse si debería aplicar también a Server Actions. Si la regla es una guía de navegación (no un gate de seguridad), excluir las requests con header `next-action`.

### #2 — Cadenas de redirect anidados pueden desincronizar el `canonicalUrl` del router de Next.js

`redirect()` llamado dentro de un layout, como reacción a un `redirectTo` de otro `redirect()`/`signIn()` previo, puede dejar el estado interno del App Router (usado para construir la URL de futuras Server Actions) apuntando al destino intermedio en vez del final — aunque la navegación visible en el browser sea correcta. Esto no es evidente inspeccionando el código de la app: solo se manifiesta como un error obtuso en una acción posterior, potencialmente en una página distinta a donde ocurrió el encadenamiento.

**Regla**: cuando se conoce de antemano el estado que determinará un redirect posterior (ej: una cuenta recién creada siempre tiene cero memberships), redirigir directo al destino final en vez de dejar que un layout intermedio haga el segundo salto. Reduce un round-trip y evita esta clase de desync.

## Verificación

1. **Caso principal**: registrar una cuenta nueva por email/contraseña en `/registro`. Debería aterrizar directo en `/onboarding` (ya no pasa por `/dashboard`). Hacer click en "Unirme como espectador" para cualquier distrito de la lista — sin error, termina en `/dashboard` con la membership de ESPECTADOR creada.

2. **Alta por Google**: registrar una cuenta nueva vía el botón de Google. Aunque este flujo sigue usando `redirectTo: "/dashboard"` (no se pudo evitar el rebote ahí), el fix del middleware (bypass por `next-action`) debería prevenir el mismo error si el usuario intenta "Unirme como espectador" después del rebote.

3. **Sesión expirada a mitad de página**: con una sesión ya vencida, intentar cualquier Server Action (ej: guardar un formulario del admin). Debería seguir redirigiendo a `/login` — el bypass de Server Actions no afecta esta regla, que se mantuvo intacta.

4. **PWA**: sin sesión iniciada, pedir `/manifest.webmanifest` directamente (o revisar la pestaña Network al cargar cualquier página pública). Debería devolver el manifest, no un redirect a `/login`.

5. **`pnpm typecheck`, `pnpm lint`, `pnpm test`** (115 tests) pasan sin errores.
