import { resetAllData } from "@/lib/db";

export async function POST() {
  await resetAllData();
  return Response.json({ ok: true });
}
