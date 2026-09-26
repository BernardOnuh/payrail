import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PayrailApiClient } from "./apiClient.js";
import {
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  parseConfig,
  type McpConfigParsed,
} from "./config.js";
import { DemoSigner } from "./signer/signer.js";
import { makeLogSink } from "./signer/log.js";
import {
  argsSchema as getQuoteArgs,
  getQuoteDescription,
  getQuoteHandler,
  type GetQuoteArgs,
} from "./tools/getQuote.js";
import {
  argsSchema as createPayoutPlanArgs,
  createPayoutPlanDescription,
  createPayoutPlanHandler,
  type CreatePayoutPlanArgs,
} from "./tools/createPayoutPlan.js";
import {
  argsSchema as getPlanStatusArgs,
  getPlanStatusDescription,
  getPlanStatusHandler,
  type GetPlanStatusArgs,
} from "./tools/getPlanStatus.js";
import {
  argsSchema as listSupportedTokensArgs,
  listSupportedTokensDescription,
  listSupportedTokensHandler,
} from "./tools/listTokens.js";
import {
  argsSchema as signPlanArgs,
  signPlanDescription,
  signPlanHandler,
  type SignPlanArgs,
} from "./tools/signPlan.js";
import { fromError, type ToolResult } from "./tools/result.js";

/** stderr logging (stdio is the MCP transport, so anything user-facing must go to stderr). */
function log(config: { chain: string; signerEnabled: boolean }): void {
  const line = `[payrail-mcp] chain=${config.chain} signerEnabled=${config.signerEnabled}`;
  process.stderr.write(`${line}\n`);
}

export async function buildServer(raw?: Record<string, string | undefined>) {
  const config: McpConfigParsed = parseConfig(raw);

  const api = new PayrailApiClient({
    baseUrl: config.apiUrl,
    chain: config.chain,
    apiKey: config.apiKey,
  });

  let signer: DemoSigner | undefined;
  if (config.signer.enabled && config.signer.privateKey && config.signer.maxTotalUsdc) {
    const logSink = makeLogSink(config.signer.logFile);
    signer = new DemoSigner({
      chain: config.chain,
      privateKey: config.signer.privateKey,
      capUsdc: BigInt(config.signer.maxTotalUsdc),
      broadcast: config.signer.broadcast,
      logSink,
    });
  }
  log({
    chain: config.chain,
    signerEnabled: config.signer.enabled,
  });

  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });

  server.tool(
    "get_quote",
    getQuoteDescription(),
    getQuoteArgs.shape,
    async (args): Promise<ToolResult> => {
      try {
        return await getQuoteHandler(api, config, args as GetQuoteArgs);
      } catch (e) {
        return fromError(e);
      }
    },
  );

  server.tool(
    "create_payout_plan",
    createPayoutPlanDescription(),
    createPayoutPlanArgs.shape,
    async (args): Promise<ToolResult> => {
      try {
        return await createPayoutPlanHandler(
          api,
          config,
          args as CreatePayoutPlanArgs,
          { defaultPayer: signer?.address },
        );
      } catch (e) {
        return fromError(e);
      }
    },
  );

  server.tool(
    "get_plan_status",
    getPlanStatusDescription(),
    getPlanStatusArgs.shape,
    async (args): Promise<ToolResult> => {
      try {
        return await getPlanStatusHandler(api, config, args as GetPlanStatusArgs);
      } catch (e) {
        return fromError(e);
      }
    },
  );

  server.tool(
    "list_supported_tokens",
    listSupportedTokensDescription(),
    listSupportedTokensArgs.shape,
    async (): Promise<ToolResult> => {
      try {
        return listSupportedTokensHandler(config);
      } catch (e) {
        return fromError(e);
      }
    },
  );

  if (signer) {
    server.tool(
      "sign_plan",
      signPlanDescription(),
      signPlanArgs.shape,
      async (args): Promise<ToolResult> => {
        try {
          return await signPlanHandler(api, signer!, args as SignPlanArgs);
        } catch (e) {
          return fromError(e);
        }
      },
    );
  }

  return server;
}

async function main(): Promise<void> {
  const server = await buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  process.stderr.write(`[payrail-mcp] fatal: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});