"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { api, ApiError, type PayoutInput } from "@/lib/client/api";
import { chainDisplayName, chainsByName, defaultChainName, gasTokenFor, nameOfChainId, tokensFor, type ChainName, type TokenName } from "@/lib/registry";
import { humanAmount, toBaseUnits } from "@/lib/format";
import type { Payment, PayoutEstimate } from "@/lib/payrail/types";
import { Button, Card, CardTitle, CopyButton } from "@/components/ui";
import { Field, TextInput } from "@/components/field";

interface Row {
  id: number;
  recipient: string;
  amount: string;
  currency: TokenName;
  baseAmount: bigint;
  errors: { recipient?: string; amount?: string };
}

let rowSeq = 0;
function newRow(currency: TokenName): Row {
  rowSeq += 1;
  return { id: rowSeq, recipient: "", amount: "", currency, baseAmount: 0n, errors: {} };
}

function currencyDec(chain: ChainName, token: TokenName): number {
  return tokensFor(chain).find((t) => t.key === token)?.decimals ?? 6;
}

function safeBase(amount: string, dec: number): bigint {
  try {
    return toBaseUnits(amount, dec);
  } catch {
    return 0n;
  }
}

export function PayoutForm() {
  const router = useRouter();
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const switchWalletTo = async (target: ChainName) => {
    if (!isConnected) return;
    try {
      await switchChainAsync({ chainId: chainsByName[target].id });
    } catch {
      /* wallet rejected the switch; the mismatch notice below guides the user */
    }
  };

  const onChainChange = async (value: ChainName) => {
    setChain(value);
    await switchWalletTo(value);
  };

  const [chain, setChain] = useState<ChainName>(defaultChainName());
  const [source, setSource] = useState<TokenName>("USDC");
  const [memo, setMemo] = useState("");
  const [rows, setRows] = useState<Row[]>([newRow("USDC")]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [estimate, setEstimate] = useState<PayoutEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [csvNotice, setCsvNotice] = useState<string | null>(null);

  const validPayments = useMemo(
    () =>
      rows
        .filter((r) => !r.errors.recipient && !r.errors.amount && r.recipient && r.amount)
        .map((r) => ({ recipient: r.recipient as `0x${string}`, amount: r.baseAmount.toString(), currency: r.currency })),
    [rows],
  );
  const canSubmit = isConnected && validPayments.length > 0;

  const walletChain = chainId != null ? nameOfChainId(chainId) : null;
  const chainMismatch = isConnected && walletChain != null && walletChain !== chain;

  const updateRow = (id: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const mergeAndValidate = (r: Row, patch: Partial<Row>): Row => {
    const merged = { ...r, ...patch };
    const recipient = "recipient" in patch ? merged.recipient : r.recipient;
    const amount = "amount" in patch ? merged.amount : r.amount;
    const dec = currencyDec(chain, merged.currency);
    const errors: Row["errors"] = {};
    if (recipient.trim() && !isAddress(recipient)) errors.recipient = "Not a valid address.";
    if (amount.trim()) {
      try {
        toBaseUnits(amount, dec);
      } catch (e) {
        errors.amount = e instanceof RangeError ? e.message : "Invalid amount.";
      }
    }
    return { ...merged, baseAmount: errors.amount ? 0n : safeBase(merged.amount, dec), errors };
  };

  const onRowChange = (id: number, patch: Partial<Row>) => {
    const target = rows.find((r) => r.id === id);
    if (!target) return;
    updateRow(id, mergeAndValidate(target, patch));
  };

  const addRow = () => setRows((prev) => [...prev, newRow(source)]);
  const removeRow = (id: number) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));

  // Debounced live estimate whenever the plan-shape changes.
  const paymentsKey = JSON.stringify(validPayments);
  useEffect(() => {
    if (validPayments.length === 0 || !address) return;
    let stale = false;
    const timer = setTimeout(() => {
      api
        .estimate({ chain, sourceToken: source, payer: address ?? "", payments: validPayments })
        .then((e) => {
          if (!stale) {
            setEstimate(e);
            setEstimateError(null);
          }
        })
        .catch((e) => {
          if (!stale) setEstimateError(e instanceof ApiError ? e.message : "Estimate failed.");
        });
    }, 350);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, source, paymentsKey]);

  const totalsByCurrency = useMemo(() => {
    const map = new Map<TokenName, bigint>();
    for (const r of rows) if (r.baseAmount > 0n) map.set(r.currency, (map.get(r.currency) ?? 0n) + r.baseAmount);
    return map;
  }, [rows]);

  const onSubmit = async () => {
    if (!canSubmit || !address) return;
    setSubmitting(true);
    setSubmitError(null);
    const payments: Payment[] = validPayments;
    const payload: PayoutInput = { chain, payer: address, sourceToken: source, memo: memo.trim() || undefined, payments };
    try {
      const res = await api.createPayout(payload);
      router.push(`/plans/${res.plan.planId}`);
    } catch (e) {
      setSubmitError(e instanceof ApiError ? e.message : "Failed to create plan. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => { e.preventDefault(); void onSubmit(); }} aria-label="New payout">
        <Card>
          <CardTitle title="Deal" />
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Chain" htmlFor="chain" hint="Base Sepolia uses ETH for gas — keep a little for fees.">
              <select
                id="chain"
                value={chain}
                onChange={(e) => setChain(e.target.value as ChainName)}
                className="flex h-9 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
              >
                {(["testnet", "mainnet", "basesepolia", "base"] as ChainName[]).map((c) => (
                  <option key={c} value={c}>
                    {chainDisplayName(c)}{c === "testnet" || c === "basesepolia" ? " (safe)" : " (real funds)"}
                  </option>
                ))}
              </select>
              {isConnected && walletChain !== chain ? (
                <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => void switchWalletTo(chain)}>
                  Switch wallet to {chainDisplayName(chain)}
                </Button>
              ) : null}
            </Field>
            <Field label="Source token" htmlFor="source" hint="USDC is native gas on Arc; on Base gas is ETH.">
              <select
                id="source"
                value={source}
                onChange={(e) => setSource(e.target.value as TokenName)}
                className="flex h-9 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
              >
                {tokensFor(chain).map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.key}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Payer" htmlFor="payer" hint={isConnected ? "Connected wallet address" : "Connect a wallet to continue."}>
              <div className="flex gap-2">
                <TextInput
                  id="payer"
                  value={isConnected && address ? address : ""}
                  disabled
                  placeholder="0x…"
                  className="font-mono text-xs"
                  aria-label="Payer address (from wallet)"
                />
                {isConnected && address ? <CopyButton value={address} label="Copy payer address" /> : null}
              </div>
            </Field>
          </div>
          {chainMismatch ? (
            <p className="mt-3 flex items-center gap-2 text-[12.5px] text-amber" role="alert">
              Wallet is on {walletChain}, form is on {chain}. Switch the wallet or the chain before creating a plan.
            </p>
          ) : null}
        </Card>

        <Card>
          <CardTitle title="Recipients" aside={<span className="mono-num text-[12px] text-faint">{rows.length} row{rows.length === 1 ? "" : "s"}</span>} />
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="grid gap-2 rounded-lg border border-line bg-surface2/60 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <Field label="Address" htmlFor={`r-${r.id}-addr`} error={r.errors.recipient}>
                  <TextInput
                    id={`r-${r.id}-addr`}
                    value={r.recipient}
                    invalid={Boolean(r.errors.recipient)}
                    placeholder="0x…"
                    className="font-mono text-xs"
                    onChange={(e) => onRowChange(r.id, { recipient: e.target.value })}
                  />
                </Field>
                <Field label="Amount" htmlFor={`r-${r.id}-amt`} error={r.errors.amount}>
                  <TextInput
                    id={`r-${r.id}-amt`}
                    value={r.amount}
                    invalid={Boolean(r.errors.amount)}
                    placeholder="0.0"
                    inputMode="decimal"
                    className="mono-num text-xs"
                    onChange={(e) => onRowChange(r.id, { amount: e.target.value })}
                  />
                </Field>
                <Field label="Currency" htmlFor={`r-${r.id}-cur`}>
                  <select
                    id={`r-${r.id}-cur`}
                    value={r.currency}
                    className="flex h-9 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
                    onChange={(e) => onRowChange(r.id, { currency: e.target.value as TokenName })}
                  >
                    {tokensFor(chain).map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.key}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="flex items-end pb-1">
                  <button
                    type="button"
                    onClick={() => removeRow(r.id)}
                    aria-label="Remove recipient"
                    disabled={rows.length === 1}
                    className="inline-flex h-9 items-center rounded-md px-2 text-faint hover:text-danger disabled:opacity-40"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={addRow}>
              + Add recipient
            </Button>
            <CsvImport
              chain={chain}
              defaultCurrency={source}
              onImport={(imported) => setRows((prev) => [...prev, ...imported])}
              onNotice={setCsvNotice}
            />
            {csvNotice ? <span className="text-[12px] text-faint">{csvNotice}</span> : null}
          </div>
        </Card>

        <Card>
          <CardTitle title="Memo" aside={<span className="text-[11.5px] text-faint">optional, e.g. “2026-Q3 contractor payouts”</span>} />
          <TextInput id="memo" value={memo} placeholder="Internal label (never on-chain)" onChange={(e) => setMemo(e.target.value)} />
        </Card>

        <Card>
          <CardTitle title="Running total" />
          <TotalsPanel
            totalsByCurrency={totalsByCurrency}
            chain={chain}
            estimate={validPayments.length > 0 ? estimate : null}
            estimateError={validPayments.length > 0 ? estimateError : null}
            sourceDec={currencyDec(chain, source)}
            source={source}
          />
          {submitError ? (
            <p className="mt-3 rounded-md border border-danger bg-dangersoft px-3 py-2 text-[12.5px] text-danger" role="alert">
              {submitError}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!canSubmit || submitting} size="lg">
              {submitting ? "Creating plan…" : "Review plan"}
            </Button>
            {!isConnected ? <p className="text-[12.5px] text-muted">Connect a wallet to sign — plans never sign themselves.</p> : null}
            {isConnected && validPayments.length === 0 ? <p className="text-[12.5px] text-muted">Add at least one valid recipient.</p> : null}
          </div>
        </Card>
      </form>
    </div>
  );
}

function TotalsPanel({ totalsByCurrency, chain, estimate, estimateError, source, sourceDec }: {
  totalsByCurrency: Map<TokenName, bigint>;
  chain: ChainName;
  estimate: PayoutEstimate | null;
  estimateError: string | null;
  source: TokenName;
  sourceDec: number;
}) {
  const rows = [...totalsByCurrency.entries()];
  const gas = estimate?.gasToken ?? gasTokenFor(chain);
  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-[13px] text-faint">No payouts yet — totals appear as you add recipients.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map(([t, base]) => (
            <li key={t} className="flex items-center justify-between text-[13px]">
              <span className="text-muted">{t}</span>
              <span className="mono-num font-medium text-ink">
                {humanAmount(base, currencyDec(chain, t))} {t}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-line pt-3">
        {estimateError ? (
          <p className="text-[12.5px] text-danger">{estimateError}</p>
        ) : estimate ? (
          <div className="grid gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-2">
            <EstimateLine label="Source needed" value={`${humanAmount(estimate.sourceNeeded[source] ?? "0", sourceDec)} ${source}`} />
            <EstimateLine label="Est. gas" value={`${humanAmount(estimate.estimatedGasUsdc, gas.decimals)} ${gas.symbol}`} />
            <EstimateLine label="Fees" value={`${humanAmount(estimate.feesUsdc, 18)} USDC`} />
            <EstimateLine label="Steps" value={`${estimate.stepsPreview.length}`} />
          </div>
        ) : (
          <p className="text-[12.5px] text-faint">Adding amounts computes a live estimate…</p>
        )}
      </div>
    </div>
  );
}

function EstimateLine({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center justify-between gap-3 text-muted">
      {label}
      <span className="mono-num text-ink">{value}</span>
    </span>
  );
}

function CsvImport({ chain, defaultCurrency, onImport, onNotice }: {
  chain: ChainName;
  defaultCurrency: TokenName;
  onImport: (rows: Row[]) => void;
  onNotice: (msg: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const imported: Row[] = [];
      const errors: string[] = [];
      for (const [i, line] of lines.entries()) {
        if (line.startsWith("#") || /address|recipient/i.test(line) && i === 0) continue;
        const parts = line.split(/[,\t;]/).map((p) => p.trim());
        const [rawAddr, rawAmt, rawCur] = parts;
        const upper = rawCur?.toUpperCase();
        const currency: TokenName =
          upper === "USDC" || upper === "EURC" || upper === "WETH"
            ? upper
            : upper === "CIRBTC"
              ? "cirBTC"
              : defaultCurrency;
        if (!isAddress(rawAddr ?? "")) {
          errors.push(`line ${i + 1}: bad address`);
          continue;
        }
        let base = 0n;
        try {
          base = toBaseUnits(rawAmt ?? "", currencyDec(chain, currency));
        } catch {
          base = 0n;
        }
        if (base <= 0n) {
          errors.push(`line ${i + 1}: invalid amount`);
          continue;
        }
        rowSeq += 1;
        imported.push({ id: rowSeq, recipient: rawAddr!, amount: rawAmt!, currency, baseAmount: base, errors: {} });
      }
      if (imported.length > 0) onImport(imported);
      if (errors.length > 0) onNotice(`${imported.length} added · ${errors.length} skipped (${errors[0]}${errors.length > 1 ? " +more" : ""})`);
      else if (imported.length === 0) onNotice("No valid rows found.");
      else onNotice(`${imported.length} recipients imported.`);
    };
    reader.readAsText(file);
  };
  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv,.tsv"
        className="hidden"
        aria-label="Import recipients from CSV"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
        Import CSV
      </Button>
    </>
  );
}