/**
 * Domain error type surfaced to HTTP as the standard envelope.
 * Codes/statuses align with apiErrorSchema (src/http/schemas/common.ts)
 * and the web client's errors.ts map.
 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;
  readonly requestId?: string;

  constructor(code: string, message: string, opts: { status?: number; details?: unknown; requestId?: string } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = opts.status ?? DEFAULT_STATUS[code] ?? 500;
    this.details = opts.details;
    this.requestId = opts.requestId;
  }
}

const DEFAULT_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  POLICY_VIOLATION: 403,
  RATE_LIMITED: 429,
  QUOTE_FAILED: 422,
  QUOTE_EXPIRED: 422,
  PAYER_INSUFFICIENT_FUNDS: 422,
  NOT_FOUND: 404,
  STEP_NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
};

export const validation = (message: string, details?: unknown) =>
  new ApiError("VALIDATION_ERROR", message, { details });

export const unauthorized = (message = "Missing or unknown API key.") =>
  new ApiError("UNAUTHORIZED", message);

export const policyViolation = (message: string, details?: unknown) =>
  new ApiError("POLICY_VIOLATION", message, { details });

export const forbidden = (message = "This endpoint requires the operator key.") =>
  new ApiError("FORBIDDEN", message);

export const rateLimited = (message = "Request rate exceeded.") =>
  new ApiError("RATE_LIMITED", message);

export const quoteFailed = (message: string, details?: unknown) =>
  new ApiError("QUOTE_FAILED", message, { details });

export const quoteExpired = (message = "The quote has expired; create a new plan.") =>
  new ApiError("QUOTE_EXPIRED", message);

export const payerInsufficientFunds = (message: string, details?: unknown) =>
  new ApiError("PAYER_INSUFFICIENT_FUNDS", message, { details });

export const notFound = (message = "Resource not found.") => new ApiError("NOT_FOUND", message);

export const stepNotFound = (message = "Step not found.") => new ApiError("STEP_NOT_FOUND", message);

export const internal = (message = "Internal error.", details?: unknown) =>
  new ApiError("INTERNAL_ERROR", message, { details });