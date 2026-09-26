import { getProvider } from "@/lib/payrail/server";
import { errorResponse } from "@/lib/payrail/errors";

export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await getProvider().revokeKey(id);
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}