# ADR-0001 — Arquitectura en dos capas: scoring primero, personas después

**Estado:** Aceptado  
**Fecha:** 2026-04-26  
**Planes afectados:** todos (en particular 0b, 4b, 10–14)

---

## Contexto

El sistema nació para cubrir una necesidad inmediata: registrar y publicar puntajes de eventos competitivos scouts. Sin embargo, en la misma sesión de diseño surgió una visión más amplia: digitalizar el padrón de miembros del grupo, su inscripción anual, y la cartilla de progresión individual de cada scout.

Había que decidir cómo relacionar estas dos necesidades en el modelo de dominio sin caer en overengineering ni generar una deuda técnica difícil de pagar después.

El punto de tensión central: el sistema de scoring es **event-centric** (todo gira en torno al `Event` y la `Patrulla`); el sistema de progresión es **person-centric** (todo gira en torno al `MiembroScout` y su historia de años). No son el mismo paradigma.

---

## Decisión

Arquitectura en dos capas, con entrega incremental:

**Capa 1 — MVP de scoring (planes 0a–9):**  
Se entrega primero, sin dependencia de la Capa 2. El modelo es event-centric. La `Patrulla` es la unidad de scoring, no el individuo. `MiembroScout` se introduce en Plan 0b únicamente como **stub mínimo** (campos básicos, sin relaciones a eventos ni patrullas) para mantener la puerta abierta sin comprometer la velocidad de entrega.

**Capa 2 — Personas y progresión (planes 10–14):**  
Se construye post-MVP, cuando haya al menos un distrito usando el sistema en producción. Los planes 12–13 (inscripción, progresión) se diseñan con validación real del distrito. La Capa 2 extiende el modelo de Capa 1 de forma aditiva, sin romper nada existente.

### La regla más importante: `MiembroScout ≠ User`

Estas dos entidades se mantienen separadas permanentemente:

| | `User` | `MiembroScout` |
|---|---|---|
| Qué es | Cuenta autenticada con Google | Persona del dominio scout |
| Quiénes | Adultos con acceso al sistema (admin, juez, jefe de patrulla) | Cualquier miembro del grupo: lobatos, scouts, pioneros, rovers, dirigentes |
| Auth | Sí (Google OAuth) | No (la mayoría son menores) |
| Cuándo existe | Al loguearse por primera vez | Cuando el admin lo registra en el padrón |
| Categorías | Roles: `ADMIN \| JUEZ \| ESPECTADOR \| JEFE_PATRULLA` | `LOBATO \| EXPLORADOR \| PIONERO \| ROVER \| DIRIGENTE` |

El linkeo entre ambas es **opcional** vía `MiembroScout.userId?`. Un dirigente adulto que también es admin del sistema tendrá tanto un `User` como un `MiembroScout`, vinculados. Un lobato de 8 años solo tiene `MiembroScout`.

Este patrón es análogo al modelo Contact / User en CRMs: el contacto (persona del dominio) existe antes e independientemente de la cuenta de acceso.

---

## Consecuencias

- Plan 0b incluye `MiembroScout` con campos: `id`, `organizationId`, `grupoScoutId`, `nombre`, `fechaNacimiento?`, `categoria?`, `userId?`, `createdAt`, `updatedAt`. Sin tablas pivote a eventos.
- Plan 4b puede agregar FK opcional `Patrulla → MiembroScout[]` sin cambiar nada existente.
- Eventos creados antes del Plan 11 no tendrán `MiembroScout` vinculados a sus patrullas. Esto es **aceptable por diseño**: la información histórica de scoring sigue siendo válida; simplemente no tiene la capa de identidad individual.
- El enum `categoria` en `MiembroScout` puede refinarse en Plan 13 cuando haya validación con el distrito. Si las categorías reales difieren del enum actual, se extiende sin breaking change (agregar valores a un enum en Postgres es no-destructivo).

---

## Alternativas descartadas

**A. Diferir `MiembroScout` totalmente** (no introducirlo hasta Plan 10):  
Descartado porque los eventos en producción acumularían patrullas sin identidad de scout, y el backfill posterior sería manual y propenso a errores. El costo del stub en 0b es marginal.

**B. Unificar `MiembroScout` y `User`**:  
Descartado porque los scouts jóvenes no tienen Google accounts, y forzar auth para registrar un miembro es fricción innecesaria. Además, una persona puede cambiar de email/cuenta Google sin dejar de ser el mismo scout.

**C. Modelar progresión/inscripción desde el inicio**:  
Descartado. Diseñar el sistema de etapas y especialidades sin usuarios reales produce modelos que no encajan con la práctica real del distrito. Los planes 12–13 requieren co-diseño con el distrito.

---

## Proceso de decisión

Esta decisión surgió de una pregunta del usuario sobre si los scouts individuales tenían lugar en el modelo. El análisis llevó a identificar que el sistema en su forma original era puramente event-centric y que agregar progresión requería pensar en dos capas, no en un solo modelo creciente. La decisión de separar `MiembroScout` de `User` vino del principio Contact/User de CRMs, explicitado durante el diseño. Ver conversación del 2026-04-26 en la sesión de planificación con Claude Opus.
