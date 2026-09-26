import { getProvider } from "@/lib/payrail/server";
import { errorResponse } from "@/lib/payrail/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const plans = await getProvider().listPlans();
    return Response.json(plans);
  } catch (e) {
    return errorResponse(e);
  }
}