# ADR-0002 — Capa de repositorios con unstable_cache y revalidateTag

**Estado:** Aceptado  
**Fecha:** 2026-04-29  
**Planes afectados:** Plan 4 (memberships/grupos/invitaciones/distrito), y todos los planes futuros que agreguen queries de lectura.

---

## Contexto

Hasta el Plan 4, todas las páginas del área admin leen desde la base de datos directamente en el Server Component (con `prisma.*` o `forOrg().*` inline) y las actions invalidan con `revalidatePath("/admin/<ruta>")`.

Este enfoque tiene dos problemas concretos:

**1. Granularidad cero en la invalidación**: `revalidatePath` invalida todo el Full Route Cache de una ruta. Si una action toca datos que también aparecen en otra ruta (ej: el nombre de un grupo se muestra en el dropdown de miembros), esa ruta queda stale indefinidamente hasta la próxima navegación completa.

**2. Stale data visible en MembershipRow**: el componente usa `defaultValue` en sus selects (inputs no controlados, adoptado para evitar que el Router Cache del cliente pise el valor recién guardado con datos stale). Sin embargo, esto significa que los selects tampoco se actualizan cuando llegan props frescos del servidor. El ciclo `action → revalidatePath → re-render` no refleja el nuevo valor en el DOM.

El punto raíz de ambos problemas es la ausencia de una capa de caché con identidad de datos: el sistema no sabe qué cachés contienen memberships o grupos, solo sabe qué rutas deben re-renderizarse.

---

## Decisión

Crear `src/repositories/` como capa entre las páginas/actions y `forOrg()` / `prisma`:

- **Queries de lectura** se envuelven en `unstable_cache` con tags por organización (`memberships:{orgId}`, `grupos:{orgId}`, etc.).
- **Actions de mutación** llaman `revalidateTag(<tag>)` en lugar de `revalidatePath`.
- `forOrg()` en `src/lib/db.ts` permanece intacto como capa de tenant-isolation. Los repositorios que necesitan `include` usan `prisma.*` directamente con `organizationId` explícito en el `where`, porque el wrapper de `forOrg()` pierde los generics condicionales de Prisma (`include`/`select` no se propagan en el tipo de retorno). Los repositorios sin `include` pueden usar `forOrg()` normalmente.

### Estructura de tags

```
memberships:{organizationId}   — todos los memberships de un distrito
grupos:{organizationId}        — todos los grupos de un distrito
invitations:{organizationId}   — todas las invitaciones de un distrito
distrito:{organizationId}      — datos del Organization (nombre, slug)
```

El formato `<entidad>:<orgId>` garantiza aislamiento por tenant: `revalidateTag('memberships:org-A')` nunca toca el cache de `org-B`.

### Excepción: invitaciones sin cache

La página de invitaciones ejecuta `markInvitationsExpired()` como side-effect antes de leer. Envolver la lectura en `unstable_cache` requeriría también invalidar el cache después de esa mutación silenciosa. En lugar de eso, la función `listInvitations` del repo es una query directa (sin cache). Las actions de invitaciones igualmente llaman `revalidateTag(cacheTags.invitations(orgId))` para quedar listas cuando se elimine este side-effect del render.

### Beneficio cross-page habilitado

Con tags, `createGrupo` / `updateGrupo` / `deleteGrupo` pueden invalidar tanto `grupos:{orgId}` como `memberships:{orgId}`. Esto significa que el dropdown de grupos en la página de miembros se actualiza automáticamente cuando se modifica un grupo — algo que con `revalidatePath` requeriría hardcodear rutas adicionales en cada action.

---

## Consecuencias

- Las páginas del área admin no hacen queries inline; importan funciones del repositorio.
- Las actions no llaman `revalidatePath`; llaman `revalidateTag` con el tag correspondiente.
- Nuevas queries de lectura se agregan al repositorio de su entidad, no inline en las páginas.
- La capa de repositorio es la base para el siguiente paso: retornar el registro actualizado desde la action y actualizar el estado local del cliente sin depender del ciclo de revalidación.

---

## Alternativas descartadas

**A. Mantener revalidatePath y ampliar las rutas invalidadas**:  
Resuelve el problema cross-page pero escala mal: cada action necesita conocer todas las rutas que muestran sus datos. Acoplamiento implícito que crece con cada nueva página.

**B. React Query / SWR en el cliente**:  
Convierte las páginas en Client Components o introduce un endpoint de API para cada query. Contradice la convención del proyecto (Server Actions sobre API routes) y agrega complejidad de sincronización.

**C. Revalidar con `revalidatePath('/', 'layout')`**:  
Invalida absolutamente todo. Funciona pero elimina cualquier beneficio de caché. Inaceptable en una app multi-tenant donde un admin de un distrito no debería purgar el cache de otro.

---

## Proceso de decisión

El problema de `defaultValue` stale en `MembershipRow` expuso que la ausencia de una capa de cache con identidad de datos hacía imposible la invalidación quirúrgica. El repositorio con `unstable_cache` y tags por organización es la solución estándar de Next.js App Router para este patrón. La excepción de invitaciones se documentó explícitamente para que el side-effect en el render sea visible y pueda eliminarse en un plan futuro.
