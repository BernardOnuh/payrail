import { getProvider } from "@/lib/payrail/server";
import { errorResponse } from "@/lib/payrail/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const health = await getProvider().health();
    return Response.json(health);
  } catch (e) {
    return errorResponse(e);
  }
}