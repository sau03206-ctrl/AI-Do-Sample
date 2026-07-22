import { getState } from "@/lib/overhaul/db";

export async function GET() {
  const state = await getState();
  return Response.json(state);
}
