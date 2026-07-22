import { commitAnalysis, type AnalysisSummary } from "@/lib/overhaul/db";

export async function POST(request: Request) {
  const analysis = (await request.json()) as AnalysisSummary;
  await commitAnalysis(analysis);
  return Response.json({ ok: true });
}
