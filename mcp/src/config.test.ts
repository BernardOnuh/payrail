import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.js";

const PRIV = `0x${"11".repeat(32)}`;

describe("parseConfig", () => {
  it("applies defaults when env is empty", () => {
    const cfg = parseConfig({});
    expect(cfg.apiUrl).toBe("http://localhost:3000");
    expect(cfg.chain).toBe("testnet");
    expect(cfg.defaultSlippageBps).toBe(50);
    expect(cfg.signer.enabled).toBe(false);
  });

  it("reads env overrides", () => {
    const cfg = parseConfig({
      PAYRAIL_API_URL: "https://payrail.example.com",
      PAYRAIL_API_KEY: "k".repeat(24),
      PAYRAIL_MCP_CHAIN: "mainnet",
      PAYRAIL_MCP_SLIPPAGE_BPS: "120",
    });
    expect(cfg.apiUrl).toBe("https://payrail.example.com");
    expect(cfg.apiKey).toBe("k".repeat(24));
    expect(cfg.chain).toBe("mainnet");
    expect(cfg.defaultSlippageBps).toBe(120);
  });

  it("rejects an invalid chain name", () => {
    expect(() => parseConfig({ PAYRAIL_MCP_CHAIN: "cosmos" })).toThrow();
  });

  it("rejects signer enabled without privateKey", () => {
    expect(() =>
      parseConfig({
        MCP_SIGNER_ENABLED: "true",
        MCP_SIGNER_MAX_TOTAL_USDC: "1000000",
      }),
    ).toThrow(/signer.enabled requires signer.privateKey/);
  });

  it("rejects signer enabled without a cap", () => {
    expect(() =>
      parseConfig({
        MCP_SIGNER_ENABLED: "true",
        MCP_SIGNER_PRIVATE_KEY: PRIV,
      }),
    ).toThrow(/signer.enabled requires signer.maxTotalUsdc/);
  });

  it("rejects a malformed private key", () => {
    expect(() =>
      parseConfig({
        MCP_SIGNER_ENABLED: "true",
        MCP_SIGNER_PRIVATE_KEY: "0xzz",
        MCP_SIGNER_MAX_TOTAL_USDC: "1000000",
      }),
    ).toThrow();
  });

  it("parses a fully-enabled signer and accepts broadcast flags", () => {
    const cfg = parseConfig({
      MCP_SIGNER_ENABLED: "true",
      MCP_SIGNER_PRIVATE_KEY: PRIV,
      MCP_SIGNER_MAX_TOTAL_USDC: "5000000",
      MCP_SIGNER_BROADCAST: "1",
      MCP_SIGNER_LOG_FILE: "/tmp/x.ndjson",
    });
    expect(cfg.signer.enabled).toBe(true);
    expect(cfg.signer.privateKey).toBe(PRIV);
    expect(cfg.signer.maxTotalUsdc).toBe("5000000");
    expect(cfg.signer.broadcast).toBe(true);
    expect(cfg.signer.logFile).toBe("/tmp/x.ndjson");
  });
});