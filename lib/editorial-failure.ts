export class EditorialInfrastructureError extends Error {
  readonly code: string;

  constructor(message: string, code: string, options: ErrorOptions = {}) {
    super(message, options);
    this.name = "EditorialInfrastructureError";
    this.code = code;
  }
}

export function isEditorialInfrastructureError(error: unknown): error is EditorialInfrastructureError {
  return error instanceof EditorialInfrastructureError;
}
