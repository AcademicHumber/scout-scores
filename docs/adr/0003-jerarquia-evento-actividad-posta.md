# ADR-0003 — Jerarquía Evento → Actividad → Posta

**Estado:** Aceptado  
**Fecha:** 2026-05-02  
**Planes afectados:** Plan 6a (introduce Actividad), Plan 6b (introduce Posta con FK a Actividad), Plan 7 (scoring y leaderboard), Plan 8 (cierre y publicación)

> **Nota post-ejecución (Plan 15):** la línea 19 ("las postas... cada una con su plantilla de puntaje") y el diagrama de la línea 33 (`Posta (plantilla, ScoreSheet por patrulla)`) reflejan el modelo previo al Plan 15. Ese plan movió `templateId` de `Posta` a `Actividad`: todas las postas de una actividad comparten un único template de puntaje, definido al crear la actividad. `Posta` conserva en cambio `criteriosDescripciones`, una leyenda de qué significa cada valor de la escala, específica de esa posta. El cuerpo del ADR se conserva sin editar como registro histórico de la decisión original.

---

## Contexto

El master plan original modelaba la jerarquía de un evento como `Evento → Posta` directa, donde cada posta tenía una plantilla asignada y un peso. La tabla de roadmap original (planes 4a, 4b, 5a) asumía que las postas colgaban directamente del evento.

Durante la planeación de Plan 5 (plantillas de puntaje), el usuario clarificó cómo funciona un evento scout real:

> "Un evento tiene varios **bloques** (por ejemplo, Competición de habilidades, Construcción y Cocina). Cada bloque vale un porcentaje del total del evento. Dentro de cada bloque hay varias **postas** (estaciones)."

Esta descripción introduce un nivel intermedio con semántica propia:
- El bloque tiene un **tipo** (competición, construcción, cocina, otro) y un **peso porcentual** del total del evento.
- Las postas son las estaciones individuales dentro del bloque, cada una con su plantilla de puntaje.
- El scoring final de una patrulla en el evento = suma sobre todos los bloques de `(peso_bloque / 100) × scoring_bloque`, donde `scoring_bloque` = suma de postas del bloque.

El modelo `Evento → Posta` directo no puede capturar esta semántica sin agregar un campo `bloque: String?` redundante y sin peso porcentual por bloque como entidad de primera clase.

---

## Decisión

Introducir **`Actividad`** como entidad intermedia entre `Evento` y `Posta`:

```
Evento
└── Actividad  (tipo, pesoRelativo, orden)
    └── Posta  (plantilla, ScoreSheet por patrulla)
```

### Modelo de datos (Plan 6a)

```prisma
model Actividad {
  id           String        @id @default(cuid(2))
  eventoId     String
  nombre       String
  descripcion  String?
  tipo         ActividadTipo   // COMPETICION | CONSTRUCCION | COCINA | OTRO
  pesoRelativo Decimal       @db.Decimal(5, 2)
  orden        Int

  evento Evento @relation(fields: [eventoId], references: [id], onDelete: Cascade)

  @@unique([eventoId, orden])
  @@index([eventoId])
}

enum ActividadTipo {
  COMPETICION
  CONSTRUCCION
  COCINA
  OTRO
}
```

### Regla de validación

La suma de `pesoRelativo` de todas las actividades de un evento **debe ser exactamente 100.00** (con tolerancia ±0.01 para artefactos de aritmética decimal) al ejecutar la transición `BORRADOR → ACTIVO`. En estado BORRADOR la suma puede ser cualquier valor; la UI muestra el avance.

### Fórmula de scoring final (Plan 6b/7)

```
score_patrulla_evento = Σ actividades (
  actividad.pesoRelativo / 100
  × Σ postas_de_actividad (
      posta.score_total × posta.weight
    )
)
```

Donde `posta.score_total` = suma de `ScoreEntry` de criterios `PUNTUABLE` de la planilla de esa patrulla en esa posta.

---

## Consecuencias

### Positivas

- Refleja fielmente el dominio scout real: los bloques son unidades de organización y de peso del evento.
- Permite reportes segmentados por actividad (¿cómo le fue a la patrulla X en Construcción?), no solo por posta.
- El admin puede reordenar actividades completas (con todas sus postas) y ajustar pesos porcentuales de cada bloque.
- El lock de edición (`isEventoLocked`) puede operarse a nivel de actividad: si una posta de la actividad tiene scores cargados, toda la actividad (y por extensión sus postas) queda inmutable.

### Negativas / Trade-offs

- Un nivel más de jerarquía: las queries que agrupan scores por evento deben pasar por dos JOINs (`Posta → Actividad → Evento`) en lugar de uno.
- Los planes 4b, 5a y 6 del roadmap original quedan renumerados/reescritos para reflejar la jerarquía real (ver notas en master plan).
- Los tests de Plan 6b (Posta) y Plan 7 (scoring) deben construir el árbol completo `Evento → Actividad → Posta` en sus fixtures.

---

## Alternativas descartadas

### Alternativa 1: Mantener `Evento → Posta` directa con grupos visuales en UI

- **Descripción:** las postas siguen colgando del evento; la UI agrupa las postas en "secciones" sin entidad en la DB.
- **Razón de descarte:** pierde la semántica del peso porcentual por bloque. Un cambio de peso de bloque requeriría repartir el peso entre todas las postas de ese bloque manualmente. Los reportes no pueden sumar "el total de Construcción" sin duplicar lógica en múltiples lugares.

### Alternativa 2: Campo `Posta.bloque: String?` + `Posta.pesoBloque: Decimal?`

- **Descripción:** agregar campos opcionales en `Posta` para indicar a qué bloque pertenece y cuál es el peso del bloque.
- **Razón de descarte:** denormaliza el peso (el mismo valor se repite en todas las postas del bloque, con riesgo de inconsistencia). No hay entidad que represente el bloque como un todo, lo que dificulta reordenar bloques, agregar metadatos del bloque (tipo, descripción), y asegurar que los pesos sumen 100.

### Alternativa 3: Peso a nivel de posta directa (sin bloque)

- **Descripción:** cada posta tiene su propio `pesoRelativo` y la suma de todas las postas del evento debe ser 100.
- **Razón de descarte:** el peso real es por bloque en el escultismo, no por estación individual. Si el bloque "Construcción" vale 40% y tiene 3 postas, las postas se tratan como equivalentes dentro del bloque (o tienen pesos dentro del bloque, no del evento). Modelar el peso a nivel de posta rompe la semántica y hace más complejo el cálculo de leaderboard.

---

## Notas de implementación

- **Plan 6a** introduce `Actividad` como entidad con CRUD completo. `Posta` NO existe aún.
- **Plan 6b** introduce `Posta` con `FK → Actividad.id` (no a `Evento`). En 6b se activa el lock real: si una posta de una actividad tiene `ScoreSheet`, `isEventoLocked(eventoId)` retorna `true`.
- **Plan 6a** deja `isEventoLocked()` como helper que retorna siempre `false`, preparado para ser activado en 6b.
- El enum `ActividadTipo` es **semánticamente distinto** de `ScoreTemplateCategoria` aunque compartan valores hoy. Son entidades independientes: si mañana aparece `CAMPAMENTO` solo en actividades, se agrega en `ActividadTipo` sin tocar plantillas.
