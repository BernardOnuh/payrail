import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DemoSigner, SignerRefusal, type PlanForSigning } from "./signer.js";
import { makeLogSink } from "./log.js";

const PRIV = `0x${"11".repeat(32)}`;

function makeSigner(opts: { cap?: bigint; logFile?: string } = {}) {
  return new DemoSigner({
    chain: "testnet",
    privateKey: PRIV,
    capUsdc: opts.cap ?? 1_000_000n,
    broadcast: false,
    logSink: makeLogSink(opts.logFile ?? ""),
  });
}

function planFor(signer: DemoSigner, overrides: Partial<PlanForSigning> = {}): PlanForSigning {
  return {
    planId: "plr_test",
    payer: signer.address,
    sourceToken: "USDC",
    totals: { sourceToken: "USDC", sourceTokenSpent: "500000" },
    steps: [],
    ...overrides,
  };
}

function refuse(fn: () => void): SignerRefusal {
  try {
    fn();
  } catch (e) {
    if (e instanceof SignerRefusal) return e;
    throw e;
  }
  throw new Error("expected assertAllowedToSign to throw SignerRefusal");
}

describe("DemoSigner cap/payer/source guards (before any RPC)", () => {
  it("refuses non-USDC source plans", () => {
    const s = makeSigner();
    const plan = planFor(s, {
      sourceToken: "EURC",
      totals: { sourceToken: "EURC", sourceTokenSpent: "1" },
    });
    expect(refuse(() => s.assertAllowedToSign(plan)).code).toBe("UNSUPPORTED_SOURCE");
  });

  it("refuses when the plan payer is not the signer wallet", () => {
    const s = makeSigner();
    const other = "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12";
    const plan = planFor(s, { payer: other });
    expect(refuse(() => s.assertAllowedToSign(plan)).code).toBe("PAYER_MISMATCH");
  });

  it("refuses when the plan total exceeds the cap", () => {
    const s = makeSigner({ cap: 1_000_000n });
    const plan = planFor(s, { totals: { sourceToken: "USDC", sourceTokenSpent: "2000000" } });
    expect(refuse(() => s.assertAllowedToSign(plan)).code).toBe("CAP_EXCEEDED");
  });

  it("passes when total is exactly at the cap and payer matches", () => {
    const s = makeSigner({ cap: 1_000_000n });
    const plan = planFor(s, { totals: { sourceToken: "USDC", sourceTokenSpent: "1000000" } });
    expect(() => s.assertAllowedToSign(plan)).not.toThrow();
  });

  it("exposes the refusal total and cap in data", () => {
    const s = makeSigner({ cap: 10_000n });
    const plan = planFor(s, { totals: { sourceToken: "USDC", sourceTokenSpent: "999999" } });
    const e = refuse(() => s.assertAllowedToSign(plan));
    expect(e.code).toBe("CAP_EXCEEDED");
    expect(e.data.totalUsdcBase).toBe("999999");
    expect(e.data.capUsdcBase).toBe("10000");
  });
});

describe("signature log", () => {
  it("writes one NDJSON line per signature record to the configured file", () => {
    const dir = mkdtempSync(join(tmpdir(), "payrail-mcp-test-"));
    const file = join(dir, "signatures.ndjson");
    const sink = makeLogSink(file);

    sink.write({
      ts: "t",
      kind: "signature",
      planId: "plr_x",
      stepId: 1,
      wallet: "0x",
      to: "0x",
      calldataLength: 4,
      broadcast: false,
      totalUsdcBase: "5",
      capUsdcBase: "10",
    });
    sink.write({ ts: "t2", kind: "signature", planId: "plr_x", stepId: 2, wallet: "0x", to: "0x", calldataLength: 2, broadcast: true });

    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).planId).toBe("plr_x");
    expect(JSON.parse(lines[1]!).broadcast).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("also echoes every signature to stderr", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const sink = makeLogSink("");
      sink.write({ ts: "t", kind: "signature", planId: "plr_y", stepId: 3 });
      expect(process.stderr.write).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});