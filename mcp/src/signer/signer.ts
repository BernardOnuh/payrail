import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChain } from "@payrail/api/liquidity";
import type { ChainName } from "../config.js";
import { buildViemChain } from "./chain.js";

/** One JSON line per signature, written to stderr and/or an NDJSON file. */
export interface SignerLogSink {
  write(line: Record<string, unknown>): void;
}

export class SignerRefusal extends Error {
  readonly code: "CAP_EXCEEDED" | "PAYER_MISMATCH" | "UNSUPPORTED_SOURCE";
  readonly data: Record<string, unknown>;

  constructor(code: SignerRefusal["code"], message: string, data: Record<string, unknown> = {}) {
    super(message);
    this.name = "SignerRefusal";
    this.code = code;
    this.data = data;
  }
}

export interface PlanForSigning {
  planId: string;
  payer: `0x${string}`;
  sourceToken: string;
  totals: { sourceToken: string; sourceTokenSpent: string };
  steps: {
    stepId: number;
    type: string;
    status: string;
    description: string;
    tx: { to: `0x${string}`; data: `0x${string}`; value: string };
  }[];
}

export interface SignedStepResult {
  stepId: number;
  type: string;
  description: string;
  signed: true;
  serialized: Hex;
  txHash: `0x${string}` | null;
  explorerUrl: string | null;
  broadcast: boolean;
  calldataLength: number;
  value: string;
}

export interface SignerConfig {
  chain: ChainName;
  privateKey: string;
  /** Signing cap in USDC base units (6 decimals). */
  capUsdc: bigint;
  broadcast: boolean;
  logSink: SignerLogSink;
  rpcUrl?: string;
}

/**
 * Demo-only signer: a dedicated low-balance wallet that signs (and optionally
 * broadcasts) a plan's unsigned steps. It REFUSES to sign when:
 *   - the plan sources from anything other than USDC (this build keeps the
 *     demo surface small; USDC is also what the demo faucet drips), or
 *   - the plan total (sourceTokenSpent) exceeds the configured cap.
 *   - the plan payer is not this wallet's address.
 * Every signature attempt is logged (stderr + optional NDJSON file).
 *
 * This module intentionally does NOT sign arbitrary calldata and does not
 * cache/forward any transaction the caller did not originate from the Payrail API.
 */
export class DemoSigner {
  readonly chainName: ChainName;
  readonly account;
  readonly capUsdc: bigint;
  readonly broadcast: boolean;
  private readonly public: PublicClient;
  private readonly wallet: WalletClient;
  private readonly log: SignerLogSink;
  private readonly chainConfig;
  private readonly viemChain;
  private readonly explorerUrl: string;
  private readonly minGasGwei: bigint;

  constructor(cfg: SignerConfig) {
    this.chainName = cfg.chain;
    this.chainConfig = getChain(cfg.chain);
    this.account = privateKeyToAccount(cfg.privateKey as Hex);
    this.capUsdc = cfg.capUsdc;
    this.broadcast = cfg.broadcast;
    this.log = cfg.logSink;
    this.viemChain = buildViemChain(cfg.chain);
    this.explorerUrl = this.chainConfig.explorerUrl;
    this.minGasGwei = BigInt(this.chainConfig.minGasGwei);
    const transport = http(cfg.rpcUrl ?? this.chainConfig.rpcUrl);
    this.public = createPublicClient({ chain: this.viemChain, transport });
    this.wallet = createWalletClient({ chain: this.viemChain, transport, account: this.account });
  }

  get address(): `0x${string}` {
    return this.account.address;
  }

  /** The check that runs BEFORE any RPC call — cap and payer/source guards. */
  assertAllowedToSign(plan: PlanForSigning): void {
    if (plan.totals.sourceToken !== "USDC") {
      throw new SignerRefusal(
        "UNSUPPORTED_SOURCE",
        `The signer only handles USDC-source plans in this build. This plan sources ${plan.totals.sourceToken}.`,
        { sourceToken: plan.totals.sourceToken },
      );
    }
    if (plan.payer.toLowerCase() !== this.account.address.toLowerCase()) {
      throw new SignerRefusal(
        "PAYER_MISMATCH",
        `Plan payer does not match the demo signer wallet. Plan payer ${plan.payer}, signer ${this.account.address}.`,
        { planPayer: plan.payer, signer: this.account.address },
      );
    }
    const total = BigInt(plan.totals.sourceTokenSpent);
    if (total > this.capUsdc) {
      throw new SignerRefusal(
        "CAP_EXCEEDED",
        `Plan total ${total} USDC (base units) exceeds the signer cap of ${this.capUsdc} USDC (base units). Refusing to sign.`,
        { totalUsdcBase: total.toString(), capUsdcBase: this.capUsdc.toString() },
      );
    }
  }

  /**
   * Sign (and optionally broadcast + await finality) each unsigned step in order.
   * Throws SignerRefusal before any RPC if the plan is not allowed.
   */
  async sign(plan: PlanForSigning): Promise<SignedStepResult[]> {
    this.assertAllowedToSign(plan);
    const total = BigInt(plan.totals.sourceTokenSpent);

    const results: SignedStepResult[] = [];
    const baseNonce = await this.public.getTransactionCount({
      address: this.account.address,
    });
    let nonce = baseNonce;
    const maxFeePerGas = (this.minGasGwei + 5n) * 10n ** 9n;

    for (const step of plan.steps) {
      if (step.status === "confirmed") continue;
      const tx = step.tx;
      const to = tx.to;
      const data = tx.data as Hex;
      const value = BigInt(tx.value);

      const gas = await this.public.estimateGas({
        account: this.account.address,
        to,
        data,
        value,
      });

      const serialized = await this.wallet.signTransaction({
        account: this.account.address,
        chain: this.viemChain,
        to,
        data,
        value,
        gas,
        maxFeePerGas,
        nonce,
      });

      let txHash: `0x${string}` | null = null;
      if (this.broadcast) {
        txHash = await this.wallet.sendRawTransaction({ serializedTransaction: serialized });
        const receipt = await this.public.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });
        if (receipt.status !== "success") {
          throw new Error(
            `Transaction ${txHash} reverted (receipt status !== success) while broadcasting step ${step.stepId} of plan ${plan.planId}`,
          );
        }
      }

      this.log.write({
        ts: new Date().toISOString(),
        kind: "signature",
        planId: plan.planId,
        stepId: step.stepId,
        stepType: step.type,
        description: step.description,
        wallet: this.account.address,
        to,
        calldataLength: Math.floor(data.length / 2 - 1),
        value,
        gas: gas.toString(),
        maxFeePerGasGwei: (maxFeePerGas / 10n ** 9n).toString(),
        nonce,
        totalUsdcBase: total.toString(),
        capUsdcBase: this.capUsdc.toString(),
        broadcast: this.broadcast,
        txHash,
      });

      results.push({
        stepId: step.stepId,
        type: step.type,
        description: step.description,
        signed: true,
        serialized,
        txHash,
        explorerUrl: txHash ? `${this.explorerUrl}/tx/${txHash}` : null,
        broadcast: this.broadcast,
        calldataLength: Math.floor(data.length / 2 - 1),
        value: value.toString(),
      });
      nonce += 1;
    }
    return results;
  }
}