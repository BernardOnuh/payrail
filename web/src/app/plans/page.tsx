import { RecentPlans } from "@/components/recent-plans";

export default function PlansPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Plans</h1>
          <p className="mt-1 text-[14px] text-muted">Every payout plan — signed or pending — with live status.</p>
        </div>
      </div>
      <RecentPlans />
    </div>
  );
}