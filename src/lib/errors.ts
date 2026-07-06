export class BusinessError extends Error {
  constructor(
    public readonly code: string,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(code)
    this.name = "BusinessError"
  }
}

// Códigos usados en el sistema:
// ESCALA_INVALIDA          — escala de valores no tiene mínimo 2 valores ordenados
// NOT_FOUND                — entidad no encontrada
// NOMBRE_DUPLICADO         — nombre ya existe en la organización
// MODO_INCOMPATIBLE        — cambio de modo no válido para la plantilla
// CRITERIO_NO_ENCONTRADO   — criterio no encontrado en la plantilla
// IN_USE                   — plantilla en uso, no se puede modificar
// NO_DELETABLE             — evento no puede eliminarse (no está en BORRADOR)
// INVALID_TRANSITION       — transición de estado no permitida
// PESOS_INVALIDOS          — suma de pesoRelativo de actividades ≠ 100 (al activar)
// ACTIVIDAD_NO_ENCONTRADA  — actividad no encontrada en el evento
// EVENTO_LOCKED            — evento tiene scores cargados, actividades inmutables
// FECHA_INVALIDA           — fechaFin < fechaInicio
// POSTA_NO_ENCONTRADA      — posta no encontrada en la actividad
// PATRULLA_NO_ENCONTRADA   — patrulla no encontrada en el evento
// PATRULLA_NOMBRE_DUPLICADO — ya existe una patrulla con ese nombre en el evento
// JUEZ_INVALIDO            — usuario sin rol JUEZ o ADMIN en la org
// ACTIVIDAD_SIN_POSTAS     — actividad no tiene postas al intentar activar
// ACTIVIDAD_SIN_PLANTILLA  — actividad sin plantilla asignada al intentar activar (Plan 15)
// EVENTO_SIN_PATRULLAS     — evento sin patrullas al intentar activar
// GRUPO_SCOUT_INVALIDO     — grupo scout no pertenece a la org
// PLANTILLA_INVALIDA       — plantilla no pertenece a la org o está archivada
// PRE_ACTIVACION_INCOMPLETA — acumulación de errores de gates al activar
// NOMBRE_POSTA_DUPLICADO   — ya existe una posta con ese nombre en la org
// POSTA_YA_ASIGNADA_EN_EVENTO — posta ya asignada a otra actividad del mismo evento
// POSTA_EN_USO             — posta tiene asignaciones activas, no se puede eliminar
// ASIGNACION_NO_ENCONTRADA — AsignacionPosta no encontrada o no pertenece a la org
// SCORE_SHEET_NO_ENCONTRADA — ScoreSheet no encontrada
// FORBIDDEN_NO_ASIGNADO    — userId no es el juez asignado ni es ADMIN
// EVENTO_NO_ACTIVO         — intento de cargar/enviar en evento que no está ACTIVO
// VALOR_FUERA_DE_ESCALA    — valor no pertenece a la escala efectiva del criterio (meta: { criterioId?, esperados, recibido })
// PUNTAJE_UNICO_REQUERIDO  — al enviar en modo PUNTAJE_UNICO sin valor
// CRITERIOS_FALTANTES      — al enviar en modo CRITERIOS, faltan entries de PUNTUABLE (meta: { criterios: [{id,nombre}] })
// SCORE_SHEET_NO_ENVIADA   — intento de reabrir una planilla en BORRADOR
// CIERRE_INCOMPLETO        — no todas las planillas están ENVIADAS (meta: { faltantes: [{postaNombre,actividadNombre,patrullaNombre,estado}] })
// VERSION_CONFLICT         — ScoreSheet.version no coincide con expectedVersion del cliente (meta: { currentVersion, scoreSheetId, estado, enviadaAt, reopenedAt })
