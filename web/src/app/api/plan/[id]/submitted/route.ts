import { getProvider } from "@/lib/payrail/server";
import { errorResponse } from "@/lib/payrail/errors";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { stepId: number; txHash: string };
    const result = await getProvider().submitStep(id, { stepId: body.stepId, txHash: body.txHash as `0x${string}` });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}