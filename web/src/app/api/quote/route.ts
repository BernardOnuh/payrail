import { getProvider } from "@/lib/payrail/server";
import { errorResponse } from "@/lib/payrail/errors";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { chain: "mainnet" | "testnet" | "basesepolia" | "base"; tokenIn: string; tokenOut: string; amount: string; slippageBps?: number };
    const result = await getProvider().quote(body as never);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}