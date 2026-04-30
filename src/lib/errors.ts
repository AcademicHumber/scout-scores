export class BusinessError extends Error {
  constructor(
    public readonly code: string,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(code)
    this.name = "BusinessError"
  }
}
