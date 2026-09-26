import { describe, expect, it } from "vitest";
import { decodeFunctionData } from "viem";
import { buildPlan } from "../src/plans/builder.js";
import { payrailRouterAbi, erc20Abi } from "../src/liquidity/abi.js";
import { inputForExactOutput, outputForExactInput, inputFee } from "../src/liquidity/poolMath.js";
import type { PayoutRequestParsed } from "../src/http/schemas/payout.js";
import { stubNet, TEST_ROUTER, TEST_PAYER, TEST_RECIPIENT, USDC_6 } from "./fixtures.js";

const R2 = "0x4444444444444444444444444444444444444444" as const;
const R3 = "0x5555555555555555555555555555555555555555" as const;

const SEED0 = 10n * USDC_6;
const SEED1 = 8_800_000n;
const FEE = 30n;

function req(payments: unknown[]): PayoutRequestParsed {
  return {
    chain: "testnet",
    payer: TEST_PAYER,
    sourceToken: "USDC",
    payments: payments as PayoutRequestParsed["payments"],
  };
}

describe("plan builder exactness (offline)", () => {
  it("produces approve -> swap -> batchPayout with deterministically exact amounts", async () => {
    const net = stubNet({ reserves: { reserve0: SEED0, reserve1: SEED1, seeded: true, feeBps: FEE } });
    const plan = await buildPlan(
      req([
        { recipient: TEST_RECIPIENT, amount: 2_000_000n, currency: "EURC" },
        { recipient: R2, amount: 1_500_000n, currency: "USDC" },
        { recipient: R3, amount: 500_000n, currency: "USDC" },
      ]),
      { net, routerAddress: TEST_ROUTER, ttlSeconds: 300 },
    );

    expect(plan.steps.length).toBe(3);
    expect(plan.steps[0].type).toBe("approve");
    expect(plan.steps[1].type).toBe("swap");
    expect(plan.steps[2].type).toBe("batchPayout");

    // Swap leg must emit EXACTLY the EURC payout the contract will produce.
    const swap = plan.steps[1] as Extract<typeof plan.steps[number], { type: "swap" }>;
    const expectedIn = inputForExactOutput(SEED0, SEED1, 2_000_000n, FEE)!;
    const expectedOut = outputForExactInput(SEED0, SEED1, expectedIn, FEE);
    expect(swap.amountIn).toBe(expectedIn);
    expect(swap.amountOut).toBe(expectedOut);
    expect(swap.minAmountOut).toBe(expectedOut);

    // approve covers every USDC the router will pull.
    const approve = plan.steps[0] as Extract<typeof plan.steps[number], { type: "approve" }>;
    expect(approve.amount).toBe(expectedIn + 2_000_000n);

    // totals
    expect(plan.totals.sourceTokenSpent).toBe(expectedIn + 2_000_000n);
    expect(plan.totals.payouts.EURC).toBe(expectedOut);
    expect(plan.totals.payouts.USDC).toBe(2_000_000n);
    expect(plan.totals.feesUsdc).toBe(inputFee(expectedIn, FEE) * 10n ** 12n);

    // calldata decodes to the exact swap args.
    const decoded = decodeFunctionData({ abi: payrailRouterAbi, data: swap.tx.data });
    expect(decoded.functionName).toBe("swapExactIn");
    expect(decoded.args).toEqual([expectedIn, expectedOut, TEST_RECIPIENT]);

    const decodedApprove = decodeFunctionData({ abi: erc20Abi, data: approve.tx.data });
    expect(decodedApprove.functionName).toBe("approve");
    expect((decodedApprove.args as [string, bigint])[1]).toBe(expectedIn + 2_000_000n);

    const decodedBatch = decodeFunctionData({
      abi: payrailRouterAbi,
      data: (plan.steps[2] as Extract<typeof plan.steps[number], { type: "batchPayout" }>).tx.data,
    });
    expect(decodedBatch.functionName).toBe("batchTransfer");
    expect(decodedBatch.args[1]).toEqual([
      { to: R2, amount: 1_500_000n },
      { to: R3, amount: 500_000n },
    ]);
  });

  it("tracks running reserves across two swap legs of the same currency", async () => {
    const net = stubNet({ reserves: { reserve0: SEED0, reserve1: SEED1, seeded: true, feeBps: FEE } });
    const plan = await buildPlan(
      req([
        { recipient: TEST_RECIPIENT, amount: 1_000_000n, currency: "EURC" },
        { recipient: R2, amount: 1_000_000n, currency: "EURC" },
      ]),
      { net, routerAddress: TEST_ROUTER, ttlSeconds: 300 },
    );
    const swaps = plan.steps.filter((s) => s.type === "swap") as Extract<
      typeof plan.steps[number],
      { type: "swap" }
    >[];

    let r0 = SEED0;
    let r1 = SEED1;
    for (const s of swaps) {
      expect(s.amountIn).toBe(inputForExactOutput(r0, r1, 1_000_000n, FEE));
      const out = outputForExactInput(r0, r1, s.amountIn, FEE);
      expect(s.amountOut).toBe(out);
      r0 += s.amountIn;
      r1 -= out;
    }
    expect(plan.totals.payouts.EURC).toBe(plan.totals.payouts.EURC);
  });
});