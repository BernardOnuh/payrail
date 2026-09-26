import { z } from "zod";

const chainNameSchema = z.enum(["mainnet", "testnet"]);
const tokenNameSchema = z.enum(["USDC", "EURC", "cirBTC", "WETH"]);

const signerConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    /** Demo wallet private key (0x-hex, 32 bytes). Never a funded production key. */
    privateKey: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
    /**
     * Signing cap in USDC base units (6 decimals). Plans must have sourceToken
     * USDC; the signer refuses when totals.sourceTokenSpent exceeds this cap.
     */
    maxTotalUsdc: z
      .string()
      .regex(/^[0-9]+$/)
      .optional(),
    /** When true, signed transactions are broadcast and awaited (1 receipt = final on Arc). */
    broadcast: z.boolean().default(false),
    /** Optional path (NDJSON) to append one line per signature. */
    logFile: z.string().default(""),
  })
  .refine((s) => !s.enabled || (s.privateKey?.length ?? 0) > 0, {
    message: "signer.enabled requires signer.privateKey",
  })
  .refine((s) => !s.enabled || (s.maxTotalUsdc?.length ?? 0) > 0, {
    message: "signer.enabled requires signer.maxTotalUsdc",
  });

export const configSchema = z.object({
  /** Payrail HTTP API base URL. */
  apiUrl: z.string().url().default("http://localhost:3000"),
  /** Payrail API key (X-API-Key). Optional at boot; quote/plan tools fail cleanly without it. */
  apiKey: z.string().min(20).optional(),
  /** Chain the MCP server targets for quotes/plans. */
  chain: chainNameSchema.default("testnet"),
  signer: signerConfigSchema,
  /** Optional API slippage override used for quotes (basis points). */
  defaultSlippageBps: z.number().int().min(1).max(10_000).default(50),
});

export type McpConfig = z.input<typeof configSchema>;
export type McpConfigParsed = z.output<typeof configSchema>;

const boolEnv = (v: string | undefined, fallback: boolean) =>
  v == null ? fallback : /^(1|true|yes|on)$/i.test(v);

const intEnv = (v: string | undefined, fallback: number) =>
  v == null ? fallback : Number.parseInt(v, 10);

/** Parse configuration from an environment-like object (defaults to process.env). */
export function parseConfig(env: Record<string, string | undefined> = process.env): McpConfigParsed {
  return configSchema.parse({
    apiUrl: env.PAYRAIL_API_URL,
    apiKey: env.PAYRAIL_API_KEY,
    chain: env.PAYRAIL_MCP_CHAIN,
    defaultSlippageBps: intEnv(env.PAYRAIL_MCP_SLIPPAGE_BPS, 50),
    signer: {
      enabled: boolEnv(env.MCP_SIGNER_ENABLED, false),
      privateKey: env.MCP_SIGNER_PRIVATE_KEY,
      maxTotalUsdc: env.MCP_SIGNER_MAX_TOTAL_USDC,
      broadcast: boolEnv(env.MCP_SIGNER_BROADCAST, false),
      logFile: env.MCP_SIGNER_LOG_FILE ?? "",
    },
  });
}

export { chainNameSchema, tokenNameSchema };
export type ChainName = z.infer<typeof chainNameSchema>;
export type TokenName = z.infer<typeof tokenNameSchema>;

export const MCP_SERVER_NAME = "payrail";
export const MCP_SERVER_VERSION = "0.1.0";