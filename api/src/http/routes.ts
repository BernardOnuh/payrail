import { createRoute, z } from "@hono/zod-openapi";
import { apiErrorSchema } from "./schemas/common.js";
import {
  quoteRequestSchema,
  quoteResponseSchema,
} from "./schemas/quote.js";
import { estimateResponseSchema, payoutRequestSchema, payoutResponseSchema } from "./schemas/payout.js";
import {
  planStateSchema,
  recentPlanSchema,
  sseEventSchema,
  submitStepResponseSchema,
  submitStepSchema,
} from "./schemas/plan.js";
import {
  apiKeyPolicySchema,
  apiKeyViewSchema,
  createApiKeyResponseSchema,
} from "./schemas/keys.js";

const apiKeyHeader = z.object({
  "X-API-Key": z
    .string()
    .min(20)
    .max(256)
    .openapi({ description: "API key (policy enforced per key)." }),
});

const security = [{ ApiKey: [] as string[] }];

const badRequest = {
  description: "Request body/params failed zod validation.",
  content: { "application/json": { schema: apiErrorSchema } },
};
const unauthorized = {
  description: "Missing or unknown API key.",
  content: { "application/json": { schema: apiErrorSchema } },
};
const forbidden = {
  description: "Presented key is valid but lacks operator privileges.",
  content: { "application/json": { schema: apiErrorSchema } },
};
const policyViolation = {
  description: "Request violates the key's policy (spend limit, slippage cap, or token allowlist).",
  content: { "application/json": { schema: apiErrorSchema } },
};
const notFound = {
  description: "Resource not found.",
  content: { "application/json": { schema: apiErrorSchema } },
};
const unprocessable = {
  description: "Quote/session failure: QUOTE_FAILED, QUOTE_EXPIRED, or PAYER_INSUFFICIENT_FUNDS.",
  content: { "application/json": { schema: apiErrorSchema } },
};
const serviceError = {
  description: "Internal or quote-source error.",
  content: { "application/json": { schema: apiErrorSchema } },
};

export const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["system"],
  responses: {
    200: {
      description: "Service health.",
      content: {
        "application/json": {
          schema: z.object({
            ok: z.literal(true),
            chain: z.enum(["mainnet", "testnet"]),
            version: z.string(),
            uptimeSec: z.number(),
          }),
        },
      },
    },
    500: serviceError,
  },
});

export const quoteRoute = createRoute({
  method: "post",
  path: "/v1/quote",
  tags: ["quote"],
  security,
  request: {
    headers: apiKeyHeader,
    body: {
      content: {
        "application/json": { schema: quoteRequestSchema },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Best quote plus alternatives.",
      content: { "application/json": { schema: quoteResponseSchema } },
    },
    400: badRequest,
    401: unauthorized,
    403: policyViolation,
    422: unprocessable,
    429: {
      description: "Key exceeds requestsPerMinute.",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    500: serviceError,
  },
});

export const payoutRoute = createRoute({
  method: "post",
  path: "/v1/payout",
  tags: ["payout"],
  security,
  request: {
    headers: apiKeyHeader,
    body: {
      content: {
        "application/json": { schema: payoutRequestSchema },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Unsigned execution plan.",
      content: { "application/json": { schema: payoutResponseSchema } },
    },
    400: badRequest,
    401: unauthorized,
    403: policyViolation,
    422: unprocessable,
    429: {
      description: "Key exceeds requestsPerMinute.",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    500: serviceError,
  },
});

export const planRoute = createRoute({
  method: "get",
  path: "/v1/plan/{id}",
  tags: ["plan"],
  security,
  request: {
    headers: apiKeyHeader,
    params: z.object({
      id: z.string().regex(/^plr_[0-9A-Za-z_-]+$/).openapi({ description: "Plan id." }),
    }),
  },
  responses: {
    200: {
      description: "Current plan state.",
      content: { "application/json": { schema: planStateSchema } },
    },
    401: unauthorized,
    404: notFound,
    422: unprocessable,
    500: serviceError,
  },
});

export const streamRoute = createRoute({
  method: "get",
  path: "/v1/stream/{id}",
  tags: ["plan", "stream"],
  security,
  request: {
    headers: apiKeyHeader,
    params: z.object({
      id: z.string().regex(/^plr_[0-9A-Za-z_-]+$/).openapi({ description: "Plan id." }),
    }),
  },
  responses: {
    200: {
      description:
        "Server-Sent Events. Each `data:` line carries one event matching `SseEvent` below.",
      content: { "text/event-stream": { schema: sseEventSchema } },
    },
    401: unauthorized,
    404: notFound,
    500: serviceError,
  },
});

export const submitStepRoute = createRoute({
  method: "post",
  path: "/v1/plan/{id}/submitted",
  tags: ["plan"],
  security,
  request: {
    headers: apiKeyHeader,
    params: z.object({
      id: z.string().regex(/^plr_[0-9A-Za-z_-]+$/).openapi({ description: "Plan id." }),
    }),
    body: {
      content: { "application/json": { schema: submitStepSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Step marked submitted; watcher takes over.",
      content: { "application/json": { schema: submitStepResponseSchema } },
    },
    400: badRequest,
    401: unauthorized,
    404: notFound,
    422: unprocessable,
    500: serviceError,
  },
});

export const estimateRoute = createRoute({
  method: "post",
  path: "/v1/estimate",
  tags: ["payout"],
  security,
  request: {
    headers: apiKeyHeader,
    body: {
      content: { "application/json": { schema: payoutRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Live totals preview (nothing is signed, stored, or spent).",
      content: { "application/json": { schema: estimateResponseSchema } },
    },
    400: badRequest,
    401: unauthorized,
    403: policyViolation,
    422: unprocessable,
    429: {
      description: "Key exceeds requestsPerMinute.",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    500: serviceError,
  },
});

export const listPlansRoute = createRoute({
  method: "get",
  path: "/v1/plans",
  tags: ["plan"],
  security,
  request: { headers: apiKeyHeader },
  responses: {
    200: {
      description: "Most recently updated plans, newest first.",
      content: { "application/json": { schema: z.array(recentPlanSchema) } },
    },
    401: unauthorized,
    500: serviceError,
  },
});

export const listKeysRoute = createRoute({
  method: "get",
  path: "/v1/keys",
  tags: ["keys"],
  security,
  request: { headers: apiKeyHeader },
  responses: {
    200: {
      description: "All non-revoked API keys.",
      content: { "application/json": { schema: z.array(apiKeyViewSchema) } },
    },
    401: unauthorized,
    403: forbidden,
    500: serviceError,
  },
});

export const createKeyRoute = createRoute({
  method: "post",
  path: "/v1/keys",
  tags: ["keys"],
  security,
  request: {
    headers: apiKeyHeader,
    body: {
      content: { "application/json": { schema: apiKeyPolicySchema } },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Key created. The raw key is shown exactly once.",
      content: { "application/json": { schema: createApiKeyResponseSchema } },
    },
    400: badRequest,
    401: unauthorized,
    403: forbidden,
    500: serviceError,
  },
});

export const revokeKeyRoute = createRoute({
  method: "delete",
  path: "/v1/keys/{id}",
  tags: ["keys"],
  security,
  request: {
    headers: apiKeyHeader,
    params: z.object({
      id: z.string().regex(/^k_[0-9A-Za-z_-]+$/).openapi({ description: "Key id." }),
    }),
  },
  responses: {
    204: { description: "Key revoked." },
    401: unauthorized,
    403: forbidden,
    404: notFound,
    500: serviceError,
  },
});

export const allRoutes = [
  healthRoute,
  quoteRoute,
  estimateRoute,
  payoutRoute,
  planRoute,
  streamRoute,
  submitStepRoute,
  listPlansRoute,
  listKeysRoute,
  createKeyRoute,
  revokeKeyRoute,
] as const;