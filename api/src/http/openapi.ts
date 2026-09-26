import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { allRoutes } from "./routes.js";

export const API_INFO = {
  title: "Payrail API",
  version: "0.1.0",
  description:
    "Non-custodial stablecoin payout API for Arc. Payrail quotes and plans swaps and batch " +
    "payouts from multiple liquidity sources and returns UNSIGNED transactions; it never holds " +
    "or signs with private keys. All amounts are bigint in base units, serialized as decimal " +
    "strings (USDC/EURC=6 decimals, cirBTC=8, WETH=18; gas/fees in native USDC at 18 decimals).",
  contact: { name: "Payrail" },
};

export function buildSpecApp(): OpenAPIHono {
  const app = new OpenAPIHono();

  app.openAPIRegistry.registerComponent("securitySchemes", "ApiKey", {
    type: "apiKey",
    in: "header",
    name: "X-API-Key",
    description: "API key issued via Payrail; each key carries a spending/slippage/rate policy.",
  });

  // Handlers are stubs: this spec is generated from the zod route schemas. Real
  // handlers are attached in routeHandlers.ts (next step of the build).
  for (const route of allRoutes) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- spec-only registration
    app.openapi(route as any, () => new Response("not implemented", { status: 501 }));
  }

  const servers =
    process.env.PUBLIC_API_URL != null
      ? [{ url: process.env.PUBLIC_API_URL }]
      : [{ url: "http://localhost:3000" }];

  app.doc("/doc", {
    openapi: "3.1.0",
    info: API_INFO,
    servers,
  });

  app.get("/docs", swaggerUI({ url: "/doc" }));

  return app;
}

/** Serialized OpenAPI document generated purely from the zod schemas. */
export function getOpenApiJson(pretty = true): string {
  const app = buildSpecApp();
  const doc = app.getOpenAPIDocument({
    openapi: "3.1.0",
    info: API_INFO,
  });
  return JSON.stringify(doc, null, pretty ? 2 : 0);
}

/** OpenAPI document (object form) for tests/consumers. */
export function getOpenApiDocument(): ReturnType<OpenAPIHono["getOpenAPIDocument"]> {
  return buildSpecApp().getOpenAPIDocument({
    openapi: "3.1.0",
    info: API_INFO,
  });
}