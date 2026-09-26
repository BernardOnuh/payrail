import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { argsSchema as getQuoteArgs } from "./getQuote.js";
import { argsSchema as createPayoutPlanArgs } from "./createPayoutPlan.js";

const LOWER = "0xabcdef1234567890abcdef1234567890abcdef12";
const CHECKSUMMED = getAddress(LOWER);

describe("get_quote args", () => {
  it("accepts valid base-unit amounts", () => {
    const res = getQuoteArgs.safeParse({
      tokenIn: "USDC",
      tokenOut: "EURC",
      amount: "1000000",
      slippageBps: 50,
    });
    expect(res.success).toBe(true);
  });

  it("rejects zero and non-integer amounts", () => {
    expect(getQuoteArgs.safeParse({ tokenIn: "USDC", tokenOut: "EURC", amount: "0" }).success).toBe(false);
    expect(getQuoteArgs.safeParse({ tokenIn: "USDC", tokenOut: "EURC", amount: "1.5" }).success).toBe(false);
    expect(getQuoteArgs.safeParse({ tokenIn: "USDC", tokenOut: "EURC", amount: "-5" }).success).toBe(false);
  });

  it("rejects tokenIn === tokenOut", () => {
    const res = getQuoteArgs.safeParse({ tokenIn: "WETH", tokenOut: "WETH", amount: "1000000000000000000" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.includes("tokenOut"))).toBe(true);
    }
  });

  it("rejects unknown tokens and out-of-range slippage", () => {
    expect(getQuoteArgs.safeParse({ tokenIn: "DOGE", tokenOut: "EURC", amount: "1" }).success).toBe(false);
    expect(
      getQuoteArgs.safeParse({ tokenIn: "USDC", tokenOut: "EURC", amount: "1", slippageBps: 20000 }).success,
    ).toBe(false);
  });
});

describe("create_payout_plan args", () => {
  const payment = (recipient = CHECKSUMMED, currency = "USDC", amount = "1000000") => {
    return { recipient, currency, amount };
  };

  it("accepts valid payments and checksums addresses", () => {
    const res = createPayoutPlanArgs.safeParse({
      payments: [payment(LOWER), payment(CHECKSUMMED, "EURC", "500000")],
      sourceToken: "USDC",
      payer: LOWER,
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.payments[0]!.recipient).toBe(CHECKSUMMED);
      expect(res.data.payer).toBe(CHECKSUMMED);
    }
  });

  it("rejects duplicate (recipient, currency) pairs", () => {
    const res = createPayoutPlanArgs.safeParse({
      payments: [payment(CHECKSUMMED, "USDC", "1000000"), payment(CHECKSUMMED, "USDC", "2000000")],
      sourceToken: "USDC",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message.includes("duplicate payment"))).toBe(true);
    }
  });

  it("rejects a valid-format but wrong-checksum address", () => {
    // flip one letter's case in a correct checksum → invalid EIP-55
    const flipped = CHECKSUMMED[2]! === CHECKSUMMED[2]!.toUpperCase() ? CHECKSUMMED[2]!.toLowerCase() : CHECKSUMMED[2]!.toUpperCase();
    const bad = (CHECKSUMMED.slice(0, 2) + flipped + CHECKSUMMED.slice(3)) as `0x${string}`;
    const res = createPayoutPlanArgs.safeParse({
      payments: [payment(bad)],
      sourceToken: "USDC",
    });
    expect(res.success).toBe(false);
  });

  it("rejects a malformed (non-0x) recipient", () => {
    const res = createPayoutPlanArgs.safeParse({
      payments: [payment("0x1234")],
      sourceToken: "USDC",
    });
    expect(res.success).toBe(false);
  });

  it("rejects zero amounts and non-integer strings", () => {
    expect(
      createPayoutPlanArgs.safeParse({ payments: [payment(CHECKSUMMED, "USDC", "0")], sourceToken: "USDC" }).success,
    ).toBe(false);
    expect(
      createPayoutPlanArgs.safeParse({ payments: [payment(CHECKSUMMED, "USDC", "2.5")], sourceToken: "USDC" }).success,
    ).toBe(false);
  });

  it("enforces the 500-payment cap", () => {
    const many = Array.from({ length: 501 }, (_, i) =>
      payment(getAddress(`0x${i.toString(16).padStart(40, "0")}`), "EURC", "1000000"),
    );
    const res = createPayoutPlanArgs.safeParse({ payments: many, sourceToken: "USDC" });
    expect(res.success).toBe(false);
  });

  it("allows 500 unique payments", () => {
    const many = Array.from({ length: 500 }, (_, i) =>
      payment(getAddress(`0x${i.toString(16).padStart(40, "0")}`), "EURC", "1000000"),
    );
    const res = createPayoutPlanArgs.safeParse({ payments: many, sourceToken: "USDC" });
    expect(res.success).toBe(true);
  });
});