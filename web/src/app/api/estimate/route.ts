import { getProvider } from "@/lib/payrail/server";
import { errorResponse } from "@/lib/payrail/errors";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Parameters<ReturnType<typeof getProvider>["estimatePayout"]>[0];
    const result = await getProvider().estimatePayout(body);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}