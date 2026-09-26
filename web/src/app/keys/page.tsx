import { KeysPanel } from "@/components/keys-panel";

export default function KeysPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Policy & keys</h1>
        <p className="mt-1 text-[14px] text-muted">API keys authorize quoting and planning only — never signing. Caps and limits are enforced on every request.</p>
      </div>
      <KeysPanel />
    </div>
  );
}