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
// ESCALA_INVALIDA       — escala de valores no tiene mínimo 2 valores ordenados
// NOT_FOUND             — entidad no encontrada
// NOMBRE_DUPLICADO      — nombre ya existe en la organización
// MODO_INCOMPATIBLE     — cambio de modo no válido para la plantilla
// CRITERIO_NO_ENCONTRADO — criterio no encontrado en la plantilla
// IN_USE                — plantilla en uso, no se puede modificar
// NO_DELETABLE          — evento no puede eliminarse (no está en BORRADOR)
// INVALID_TRANSITION    — transición de estado no permitida
// PESOS_INVALIDOS       — suma de pesoRelativo de actividades ≠ 100 (al activar)
// ACTIVIDAD_NO_ENCONTRADA — actividad no encontrada en el evento
// EVENTO_LOCKED         — evento tiene scores cargados, actividades inmutables
// FECHA_INVALIDA        — fechaFin < fechaInicio
