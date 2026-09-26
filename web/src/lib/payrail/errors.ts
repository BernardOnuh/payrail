/** Normalized error thrown by the data layer (server-side). */
export class PayrailError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId?: string;

  constructor(
    message: string,
    opts: { status: number; code: string; details?: unknown; requestId?: string },
  ) {
    super(message);
    this.name = "PayrailError";
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
    this.requestId = opts.requestId;
  }
}

export const HTTP_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  POLICY_VIOLATION: 403,
  RATE_LIMITED: 429,
  QUOTE_FAILED: 502,
  NOT_FOUND: 404,
  STEP_NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
};

export function toPayrailError(error: {
  error?: { code?: string; message?: string; details?: unknown };
  requestId?: string;
}): PayrailError {
  const code = error.error?.code ?? "INTERNAL_ERROR";
  return new PayrailError(error.error?.message ?? `Payrail error ${code}`, {
    status: HTTP_STATUS[code] ?? 500,
    code,
    details: error.error?.details,
    requestId: error.requestId,
  });
}

/** Turn any thrown value into a JSON response for a route handler. */
export function errorResponse(e: unknown): Response {
  if (e instanceof PayrailError) {
    return Response.json(
      { error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) }, requestId: e.requestId ?? null },
      { status: e.status },
    );
  }
  const message = e instanceof Error ? e.message : String(e);
  return Response.json({ error: { code: "INTERNAL_ERROR", message } }, { status: 500 });
}