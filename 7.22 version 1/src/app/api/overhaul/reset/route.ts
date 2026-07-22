import { resetToSeed } from "@/lib/overhaul/db";

export async function POST() {
  await resetToSeed();
  return Response.json({ ok: true });
}
