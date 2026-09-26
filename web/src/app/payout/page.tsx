import { PayoutForm } from "@/components/payout-form";

export default function PayoutPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">New payout</h1>
        <p className="mt-1 text-[14px] text-muted">Recipients become an unsigned plan you and your agent can review — then your wallet signs it.</p>
      </div>
      <PayoutForm />
    </div>
  );
}