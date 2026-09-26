import { describe, expect, it } from "vitest";
import {
  makeHarness,
  payoutBody,
  stubNet,
  TEST_RECIPIENT,
  USDC_6,
} from "./fixtures.js";

/** POST /v1/payout and return {status, body}. */
async function postPayout(h: ReturnType<typeof makeHarness>, body: unknown) {
  const res = await h.app.request("/v1/payout", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...h.apiKeyHeader },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

describe("negative testnet-governance cases (offline, deterministic)", () => {
  it("rejects an unknown API key with UNAUTHORIZED", async () => {
    const h = makeHarness();
    const res = await h.app.request("/v1/payout", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": "pkl_wrong_key_value_000" },
      body: JSON.stringify(payoutBody()),
    });
    expect(res.status).toBe(401);
    const b = (await res.json()) as { error: { code: string } };
    expect(b.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a missing API key header with VALIDATION_ERROR", async () => {
    const h = makeHarness();
    const res = await h.app.request("/v1/payout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payoutBody()),
    });
    expect(res.status).toBe(400);
    const b = (await res.json()) as { error: { code: string } };
    expect(b.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a payment in a non-allowlisted token with POLICY_VIOLATION", async () => {
    const h = makeHarness({ allowedTokens: ["USDC"] });
    const { status, body } = await postPayout(
      h,
      payoutBody({
        payments: [
          { recipient: TEST_RECIPIENT, amount: "1000000", currency: "EURC" },
        ],
      }),
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe("POLICY_VIOLATION");
    expect((body.error.details as { token: string }).token).toBe("EURC");
  });

  it("rejects a request over the key's spend cap with POLICY_VIOLATION", async () => {
    const h = makeHarness({ capUsdc: USDC_6 * 20n });
    // 25 USDC direct payout > 20 USDC cap
    const { status, body } = await postPayout(
      h,
      payoutBody({
        payments: [{ recipient: TEST_RECIPIENT, amount: (25n * USDC_6).toString(), currency: "USDC" }],
      }),
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe("POLICY_VIOLATION");
  });

  it("rejects duplicate recipient+currency payments with VALIDATION_ERROR", async () => {
    const h = makeHarness();
    const { status, body } = await postPayout(
      h,
      payoutBody({
        payments: [
          { recipient: TEST_RECIPIENT, amount: "1000000", currency: "USDC" },
          { recipient: TEST_RECIPIENT, amount: "2000000", currency: "USDC" },
        ],
      }),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an empty payments array with VALIDATION_ERROR", async () => {
    const h = makeHarness();
    const { status, body } = await postPayout(h, payoutBody({ payments: [] }));
    expect(status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects tokenIn==tokenOut quotes with VALIDATION_ERROR", async () => {
    const h = makeHarness();
    const res = await h.app.request("/v1/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...h.apiKeyHeader },
      body: JSON.stringify({
        chain: "testnet",
        tokenIn: "USDC",
        tokenOut: "USDC",
        amount: "1000000",
        slippageBps: 50,
      }),
    });
    expect(res.status).toBe(400);
    const b = (await res.json()) as { error: { code: string } };
    expect(b.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects quote request exceeding the key's maxSlippageBps", async () => {
    const h = makeHarness();
    const res = await h.app.request("/v1/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...h.apiKeyHeader },
      body: JSON.stringify({
        chain: "testnet",
        tokenIn: "USDC",
        tokenOut: "EURC",
        amount: "1000000",
        slippageBps: 1000, // policy cap is 100
      }),
    });
    expect(res.status).toBe(403);
    const b = (await res.json()) as { error: { code: string } };
    expect(b.error.code).toBe("POLICY_VIOLATION");
  });

  it("rejects an underfunded payer with PAYER_INSUFFICIENT_FUNDS", async () => {
    const net = stubNet({ USDC: USDC_6 * 4n }); // payer holds 4 USDC
    const h = makeHarness({ net });
    const { status, body } = await postPayout(
      h,
      payoutBody({
        payments: [{ recipient: TEST_RECIPIENT, amount: (5n * USDC_6).toString(), currency: "USDC" }],
      }),
    );
    expect(status).toBe(422);
    expect(body.error.code).toBe("PAYER_INSUFFICIENT_FUNDS");
  });

  it("rejects a payer with no native USDC for gas with PAYER_INSUFFICIENT_FUNDS", async () => {
    const net = stubNet({ native: 0n });
    const h = makeHarness({ net });
    const { status, body } = await postPayout(
      h,
      payoutBody({
        payments: [{ recipient: TEST_RECIPIENT, amount: "1000000", currency: "USDC" }],
      }),
    );
    expect(status).toBe(422);
    expect(body.error.code).toBe("PAYER_INSUFFICIENT_FUNDS");
  });

  it("rejects submitting a step after the quote expired with QUOTE_EXPIRED", async () => {
    const h = makeHarness({ ttlSeconds: 0 }); // plans expire instantly
    const { status, body } = await postPayout(h, payoutBody());
    expect(status).toBe(200);

    const planId = (body.plan as { planId: string }).planId;
    await new Promise((r) => setTimeout(r, 30));

    const res = await h.app.request(`/v1/plan/${planId}/submitted`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...h.apiKeyHeader },
      body: JSON.stringify({
        stepId: 0,
        txHash: "0x" + "ab".repeat(32),
      }),
    });
    expect(res.status).toBe(422);
    const b = (await res.json()) as { error: { code: string } };
    expect(b.error.code).toBe("QUOTE_EXPIRED");
  });

  it("rejects out-of-order step submission (prior steps must be confirmed)", async () => {
    const h = makeHarness();
    const { body } = await postPayout(h, payoutBody());
    const planId = (body.plan as { planId: string }).planId;

    // step 1 is a swap; step 0 (approve) not confirmed yet
    const res = await h.app.request(`/v1/plan/${planId}/submitted`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...h.apiKeyHeader },
      body: JSON.stringify({
        stepId: 1,
        txHash: "0x" + "cd".repeat(32),
      }),
    });
    expect(res.status).toBe(403);
    const b = (await res.json()) as { error: { code: string } };
    expect(b.error.code).toBe("POLICY_VIOLATION");
  });
});