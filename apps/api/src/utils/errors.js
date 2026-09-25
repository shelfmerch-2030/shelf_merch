export class ApiError extends Error {
  constructor(status, message, code = undefined, details = undefined) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found') {
    super(404, message, 'NOT_FOUND');
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(403, message, 'FORBIDDEN');
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    super(401, message, code);
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Conflict') {
    super(409, message, 'CONFLICT');
  }
}

export class InsufficientFundsError extends ApiError {
  constructor(message = 'Insufficient wallet funds') {
    super(422, message, 'INSUFFICIENT_FUNDS');
  }
}

export class InvalidTransitionError extends ApiError {
  constructor(entityType, from, to) {
    super(
      422,
      `Invalid ${entityType} state transition: "${from}" -> "${to}"`,
      'INVALID_STATE_TRANSITION',
      { entityType, from, to },
    );
  }
}
