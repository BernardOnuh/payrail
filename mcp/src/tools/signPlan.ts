import { z } from "zod";
import type { PayrailApiClient } from "../apiClient.js";
import type { DemoSigner, PlanForSigning } from "../signer/signer.js";
import { okResult, type ToolResult } from "./result.js";

export const argsSchema = z.object({
  planId: z
    .string()
    .regex(/^plr_[a-zA-Z0-9]+$/, "planId must match plr_<id>")
    .describe("The plan ID returned by create_payout_plan (e.g. plr_xxxx)."),
});

export type SignPlanArgs = z.output<typeof argsSchema>;

export function signPlanDescription(): string {
  return [
    "DEMO/DEV ONLY: sign the unsigned steps of an existing plan with the dedicated low-balance demo wallet.",
    "This tool is registered ONLY when MCP_SIGNER_ENABLED=true. It:",
    "  - REFUSES to sign if the plan total exceeds MCP_SIGNER_MAX_TOTAL_USDC (cap, in USDC base units).",
    "  - REFUSES non-USDC-source plans (this build only signs USDC-source flows).",
    "  - REFUSES if the plan payer is not the demo wallet.",
    "  - records every signature to the signature log (stderr + optional NDJSON file).",
    "",
    "Without MCP_SIGNER_BROADCAST=1 it only produces signed serialized transactions",
    "(broadcasting them elsewhere is your responsibility). Never run this against a funded wallet.",
  ].join("\n");
}

export async function signPlanHandler(
  api: PayrailApiClient,
  signer: DemoSigner,
  args: SignPlanArgs,
): Promise<ToolResult> {
  const state = await api.getPlan(args.planId);

  const planForSigning: PlanForSigning = {
    planId: state.planId,
    payer: state.payer,
    sourceToken: state.sourceToken,
    totals: { sourceToken: state.totals.sourceToken, sourceTokenSpent: state.totals.sourceTokenSpent },
    steps: state.steps.map((s) => ({
      stepId: s.stepId,
      type: s.type,
      status: s.status,
      description: s.description,
      tx: s.tx,
    })),
  };

  const signed = await signer.sign(planForSigning);

  return okResult({
    planId: state.planId,
    payer: signer.address,
    broadcast: signer.broadcast,
    totalUsdcBase: state.totals.sourceTokenSpent,
    capUsdcBase: signer.capUsdc.toString(),
    signedSteps: signed.map((s) => ({
      stepId: s.stepId,
      type: s.type,
      description: s.description,
      broadcast: s.broadcast,
      txHash: s.txHash,
      explorerUrl: s.explorerUrl,
      value: s.value,
      calldataLength: s.calldataLength,
      ...(s.broadcast ? {} : { serialized: s.serialized }),
    })),
    note: signer.broadcast
      ? "Transactions broadcast and confirmed (Arc finality reached at first receipt)."
      : "Steps signed but NOT broadcast; serialized transactions are returned in the step list for you to broadcast.",
    logNote: "Every signature attempt was appended to the signature log.",
    reminder: "Demo wallet and cap: never use a funded key.",
  });
}