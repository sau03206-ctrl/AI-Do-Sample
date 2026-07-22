import { addEntry, type EntryInput } from "@/lib/overhaul/db";

export async function POST(request: Request, ctx: RouteContext<"/api/overhaul/tasks/[id]/entries">) {
  const { id } = await ctx.params;
  const entry = (await request.json()) as EntryInput;
  await addEntry(id, entry);
  return Response.json({ ok: true });
}
