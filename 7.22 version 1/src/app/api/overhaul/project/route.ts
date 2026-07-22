import { updateProject, type OverhaulProject } from "@/lib/overhaul/db";

export async function PATCH(request: Request) {
  const patch = (await request.json()) as Partial<OverhaulProject>;
  await updateProject(patch);
  return Response.json({ ok: true });
}
