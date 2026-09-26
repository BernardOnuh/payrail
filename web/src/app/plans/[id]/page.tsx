import { getProvider } from "@/lib/payrail/server";
import type { PlanState } from "@/lib/payrail/types";
import { PlanPage } from "@/components/plan-page";

export default async function PlanDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const planId = decodeURIComponent(id);
  let initialPlan: PlanState | null = null;
  try {
    initialPlan = await getProvider().getPlan(planId);
  } catch {
    initialPlan = null;
  }
  return <PlanPage planId={planId} initialPlan={initialPlan} />;
}