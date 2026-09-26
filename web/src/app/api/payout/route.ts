import { getProvider } from "@/lib/payrail/server";
import { errorResponse } from "@/lib/payrail/errors";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { chain: "mainnet" | "testnet"; payer: string; sourceToken: string; memo?: string; payments: { recipient: string; amount: string; currency: string }[] };
    const result = await getProvider().createPayout(body as never);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}