import { downloadPhoto } from "@/lib/overhaul/db";

export async function GET(_req: Request, ctx: RouteContext<"/api/overhaul/photos/[name]">) {
  const { name } = await ctx.params;
  const photo = await downloadPhoto(name);

  if (!photo) {
    return Response.json({ error: "사진을 찾을 수 없습니다." }, { status: 404 });
  }

  return new Response(new Uint8Array(photo.buffer), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
