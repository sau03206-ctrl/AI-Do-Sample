import { assignTask } from "@/lib/overhaul/db";

export async function PATCH(request: Request, ctx: RouteContext<"/api/overhaul/tasks/[id]/assign">) {
  const { id } = await ctx.params;
  const { assignee } = (await request.json()) as { assignee: string | null };
  await assignTask(id, assignee);
  return Response.json({ ok: true });
}
