import { getProvider } from "@/lib/payrail/server";
import { errorResponse } from "@/lib/payrail/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const keys = await getProvider().listKeys();
    return Response.json(keys);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as never;
    const key = await getProvider().createKey(body);
    return Response.json(key, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}