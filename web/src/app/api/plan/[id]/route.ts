import { getProvider } from "@/lib/payrail/server";
import { errorResponse } from "@/lib/payrail/errors";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const plan = await getProvider().getPlan(id);
    return Response.json(plan);
  } catch (e) {
    return errorResponse(e);
  }
}