export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = 'request_failed',
  ) {
    super(message)
    this.name = 'AppError'
  }
}
