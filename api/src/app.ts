/**
 * Payrail API HTTP application. Wires the real handlers onto the OpenAPI spec,
 * configures auth + error envelopes, and exposes /doc, /docs, /openapi.json.
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import { API_INFO } from "./http/openapi.js";
import { installHandlers, newRequestId, type AppEnv, type AppServices } from "./http/handlers.js";
import { ApiError } from "./errors.js";

export function buildApiApp(services: AppServices): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (result.success) return;
      const details = result.error.issues.map((issue) => ({
        path: issue.path as (string | number)[],
        message: issue.message,
      }));
      throw new ApiError("VALIDATION_ERROR", "request failed validation", {
        status: 400,
        details,
        requestId: newRequestId(),
      });
    },
  });

  app.use("*", cors());

  app.openAPIRegistry.registerComponent("securitySchemes", "ApiKey", {
    type: "apiKey",
    in: "header",
    name: "X-API-Key",
    description: "API key issued via Payrail; each key carries a spending/slippage/rate policy.",
  });

  app.use("*", async (c, next) => {
    c.set("services", services);
    await next();
  });

  installHandlers(app);

  // Spec endpoints (single source of truth stays the zod schemas).
  const specServer = process.env.PUBLIC_API_URL ?? "http://localhost:3000";
  app.doc("/doc", { openapi: "3.1.0", info: API_INFO, servers: [{ url: specServer }] });
  app.get("/docs", swaggerUI({ url: "/doc" }));
  app.get("/openapi.json", (c) => c.json(app.getOpenAPIDocument({ openapi: "3.1.0", info: API_INFO })));

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      const api = err as ApiError;
      return c.json(
        {
          error: { code: api.code, message: api.message, ...(api.details ? { details: api.details } : {}) },
          requestId: api.requestId ?? newRequestId(),
        },
        api.status as never,
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return c.json(
      { error: { code: "INTERNAL_ERROR", message }, requestId: newRequestId() },
      500 as never,
    );
  });

  return app;
}

export { API_INFO };