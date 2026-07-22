import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import path from "node:path";

// Supabase Postgres + Storage — replaces the old better-sqlite3 file DB, which
// didn't survive across Vercel's serverless invocations (see PRD 비기능요구사항).
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

const ATTACHMENTS_BUCKET = "attachments";

let bucketReady: Promise<void> | null = null;
/** Creates the attachments Storage bucket on first use if it doesn't exist yet. */
function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = supabase.storage.createBucket(ATTACHMENTS_BUCKET, { public: false }).then(({ error }) => {
      if (error && !/already exists/i.test(error.message)) throw error;
    });
  }
  return bucketReady;
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

/** Wipes all failure history rows, attachments, and uploaded files. */
export async function resetAllData(): Promise<void> {
  await ensureBucket();
  const { data: files } = await supabase.storage.from(ATTACHMENTS_BUCKET).list();
  if (files?.length) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove(files.map((f) => f.name));
  }
  unwrap(await supabase.from("attachments").delete().gte("id", 0));
  unwrap(await supabase.from("failure_history").delete().gte("id", 0));
}

export interface FailureHistoryInput {
  title?: string;
  branch?: string;
  heatFacility?: string;
  equipmentName?: string;
  deviceName?: string;
  failureField?: string;
  status?: string;
  occurredAt?: string;
  recoveredAt?: string;
  aptCount?: string;
  buildingCount?: string;
  interruptionDuration?: string;
  interruptionPeriod?: string;
  causeManagerRaw?: string;
  causeOwnerRaw?: string;
  situation?: string;
  alarmStatus?: string;
  cause4m1e?: string;
  impactHeatLoss?: string;
  impactDuration?: string;
  emergencyAction?: string;
  recoveryDetail?: string;
  recurrencePrevention?: string;
  contentSummary?: string;
  reporter?: string;
  source?: string;
  attachments?: { fileName: string; storedName: string }[];
}

export interface FailureHistoryRow {
  id: number;
  title: string | null;
  branch: string | null;
  heat_facility: string | null;
  equipment_name: string | null;
  device_name: string | null;
  failure_field: string | null;
  status: string | null;
  occurred_at: string | null;
  recovered_at: string | null;
  apt_count: string | null;
  building_count: string | null;
  interruption_duration: string | null;
  interruption_period: string | null;
  cause_manager_raw: string | null;
  cause_owner_raw: string | null;
  situation: string | null;
  alarm_status: string | null;
  cause_4m1e: string | null;
  impact_heat_loss: string | null;
  impact_duration: string | null;
  emergency_action: string | null;
  recovery_detail: string | null;
  recurrence_prevention: string | null;
  content_summary: string | null;
  reporter: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttachmentRow {
  id: number;
  failure_id: number;
  file_name: string;
  stored_name: string;
  created_at: string;
}

function nowText(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, "");
}

export async function createFailureHistory(input: FailureHistoryInput): Promise<number> {
  const row = unwrap(
    await supabase
      .from("failure_history")
      .insert({
        title: input.title ?? "",
        branch: input.branch ?? "",
        heat_facility: input.heatFacility ?? "",
        equipment_name: input.equipmentName ?? "",
        device_name: input.deviceName ?? "",
        failure_field: input.failureField ?? "",
        status: input.status ?? "조치중",
        occurred_at: input.occurredAt ?? "",
        recovered_at: input.recoveredAt ?? "",
        apt_count: input.aptCount ?? "",
        building_count: input.buildingCount ?? "",
        interruption_duration: input.interruptionDuration ?? "",
        interruption_period: input.interruptionPeriod ?? "",
        cause_manager_raw: input.causeManagerRaw ?? "",
        cause_owner_raw: input.causeOwnerRaw ?? "",
        situation: input.situation ?? "",
        alarm_status: input.alarmStatus ?? "",
        cause_4m1e: input.cause4m1e ?? "",
        impact_heat_loss: input.impactHeatLoss ?? "",
        impact_duration: input.impactDuration ?? "",
        emergency_action: input.emergencyAction ?? "",
        recovery_detail: input.recoveryDetail ?? "",
        recurrence_prevention: input.recurrencePrevention ?? "",
        content_summary: input.contentSummary ?? "",
        reporter: input.reporter ?? "",
        source: input.source ?? "manual",
        updated_at: nowText(),
      })
      .select("id")
      .single(),
  ) as { id: number };

  const failureId = row.id;

  if (input.attachments?.length) {
    unwrap(
      await supabase
        .from("attachments")
        .insert(input.attachments.map((att) => ({ failure_id: failureId, file_name: att.fileName, stored_name: att.storedName }))),
    );
  }

  return failureId;
}

/** Inserts many rows one by one (used by the Excel migration import — not currently wired up anywhere). */
export async function bulkCreateFailureHistory(inputs: FailureHistoryInput[]): Promise<number> {
  for (const item of inputs) await createFailureHistory(item);
  return inputs.length;
}

export interface FailureHistoryFilters {
  branch?: string;
  status?: string;
  failureField?: string;
  from?: string;
  to?: string;
  q?: string;
}

const SEARCHABLE_COLUMNS = [
  "title",
  "branch",
  "heat_facility",
  "equipment_name",
  "device_name",
  "situation",
  "cause_4m1e",
  "recovery_detail",
  "recurrence_prevention",
  "content_summary",
];

export async function listFailureHistory(filters: FailureHistoryFilters = {}): Promise<FailureHistoryRow[]> {
  let query = supabase.from("failure_history").select("*");

  if (filters.branch) {
    // Prefix match, not exact: registered records often store the full label
    // (e.g. "청주지사") while the filter list uses the short branch name (e.g. "청주").
    query = query.ilike("branch", `${filters.branch}%`);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.failureField) {
    query = query.eq("failure_field", filters.failureField);
  }
  if (filters.from) {
    query = query.gte("occurred_at", filters.from);
  }
  if (filters.to) {
    query = query.lte("occurred_at", `${filters.to}T23:59`);
  }
  if (filters.q) {
    query = query.or(SEARCHABLE_COLUMNS.map((col) => `${col}.ilike.%${filters.q}%`).join(","));
  }

  return unwrap(await query.order("id", { ascending: false })) as FailureHistoryRow[];
}

export async function getFailureHistoryById(id: number): Promise<FailureHistoryRow | undefined> {
  const row = unwrap(await supabase.from("failure_history").select("*").eq("id", id).maybeSingle()) as FailureHistoryRow | null;
  return row ?? undefined;
}

/** Maps FailureHistoryInput keys (camelCase) to their failure_history columns (snake_case). */
const FIELD_COLUMN_MAP: Record<string, string> = {
  title: "title",
  branch: "branch",
  heatFacility: "heat_facility",
  equipmentName: "equipment_name",
  deviceName: "device_name",
  failureField: "failure_field",
  status: "status",
  occurredAt: "occurred_at",
  recoveredAt: "recovered_at",
  aptCount: "apt_count",
  buildingCount: "building_count",
  interruptionDuration: "interruption_duration",
  interruptionPeriod: "interruption_period",
  causeManagerRaw: "cause_manager_raw",
  causeOwnerRaw: "cause_owner_raw",
  situation: "situation",
  alarmStatus: "alarm_status",
  cause4m1e: "cause_4m1e",
  impactHeatLoss: "impact_heat_loss",
  impactDuration: "impact_duration",
  emergencyAction: "emergency_action",
  recoveryDetail: "recovery_detail",
  recurrencePrevention: "recurrence_prevention",
  contentSummary: "content_summary",
  reporter: "reporter",
};

/**
 * Partial update — only columns whose key is present on `input` are touched,
 * so callers can send either a full edit form or a small patch (e.g. just
 * `{ status, recoveredAt }` for the "mark as complete" action).
 */
export async function updateFailureHistory(id: number, input: Partial<FailureHistoryInput>): Promise<void> {
  const patch: Record<string, string> = {};
  for (const [key, column] of Object.entries(FIELD_COLUMN_MAP)) {
    if (key in input) {
      patch[column] = (input as Record<string, string | undefined>)[key] ?? "";
    }
  }

  if (Object.keys(patch).length > 0) {
    patch.updated_at = nowText();
    unwrap(await supabase.from("failure_history").update(patch).eq("id", id));
  }

  if (input.attachments?.length) {
    unwrap(
      await supabase
        .from("attachments")
        .insert(input.attachments.map((att) => ({ failure_id: id, file_name: att.fileName, stored_name: att.storedName }))),
    );
  }
}

export async function getAttachmentsByFailureId(id: number): Promise<AttachmentRow[]> {
  return unwrap(
    await supabase.from("attachments").select("*").eq("failure_id", id).order("id", { ascending: true }),
  ) as AttachmentRow[];
}

export async function getAttachmentById(id: number): Promise<AttachmentRow | undefined> {
  const row = unwrap(await supabase.from("attachments").select("*").eq("id", id).maybeSingle()) as AttachmentRow | null;
  return row ?? undefined;
}

/** Uploads an attachment's bytes to Storage under a random name and returns that name. */
export async function saveUploadedFile(buffer: Buffer, originalName: string): Promise<string> {
  await ensureBucket();
  const ext = path.extname(originalName);
  const storedName = `${crypto.randomUUID()}${ext}`;
  const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(storedName, buffer, {
    contentType: "application/octet-stream",
  });
  if (error) throw new Error(error.message);
  return storedName;
}

/** Downloads a previously-uploaded attachment's bytes, or null if it's missing. */
export async function downloadUploadedFile(storedName: string): Promise<Buffer | null> {
  await ensureBucket();
  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).download(storedName);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export interface DashboardStats {
  totalCount: number;
  thisMonthCount: number;
  ytdCount: number;
  inProgressCount: number;
  topEquipmentName: string | null;
  topEquipmentCount: number;
  monthlyTrend: { month: string; count: number }[];
  failureFieldBreakdown: { field: string; count: number }[];
  branchBreakdown: { branch: string; count: number }[];
  topEquipment: { name: string; count: number }[];
  recent: FailureHistoryRow[];
}

function groupCount(rows: FailureHistoryRow[], key: (r: FailureHistoryRow) => string, fallback: string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = key(row) || fallback;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * All figures are computed from a single fetch of failure_history — no
 * sample/mock data. PostgREST doesn't do ad-hoc GROUP BY aggregation the way
 * raw SQL did, so breakdowns are computed here in JS instead; fine at this
 * app's scale (an internal plant's failure log, not a high-volume table).
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const rows = unwrap(await supabase.from("failure_history").select("*")) as FailureHistoryRow[];

  const now = new Date();
  const thisYear = String(now.getFullYear());
  const thisMonthKey = `${thisYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const totalCount = rows.length;
  const thisMonthCount = rows.filter((r) => (r.occurred_at ?? "").startsWith(thisMonthKey)).length;
  const ytdCount = rows.filter((r) => (r.occurred_at ?? "").startsWith(thisYear)).length;
  const inProgressCount = rows.filter((r) => r.status === "조치중").length;

  const monthlyTrend: { month: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyTrend.push({
      month: `${String(d.getMonth() + 1).padStart(2, "0")}월`,
      count: rows.filter((r) => (r.occurred_at ?? "").startsWith(key)).length,
    });
  }

  const failureFieldBreakdown = groupCount(rows, (r) => r.failure_field ?? "", "미분류").map(([field, count]) => ({ field, count }));
  const branchBreakdown = groupCount(rows, (r) => r.branch ?? "", "미상")
    .slice(0, 10)
    .map(([branch, count]) => ({ branch, count }));
  const topEquipment = groupCount(rows, (r) => r.equipment_name ?? "", "미상")
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const recent = [...rows].sort((a, b) => b.id - a.id).slice(0, 5);

  return {
    totalCount,
    thisMonthCount,
    ytdCount,
    inProgressCount,
    topEquipmentName: topEquipment[0]?.name ?? null,
    topEquipmentCount: topEquipment[0]?.count ?? 0,
    monthlyTrend,
    failureFieldBreakdown,
    branchBreakdown,
    topEquipment,
    recent,
  };
}

export interface EquipmentSummaryRow {
  branch: string;
  equipmentName: string;
  count: number;
  lastOccurredAt: string | null;
  lastStatus: string | null;
}

/** Equipment isn't a managed entity yet (PRD open issue) — this aggregates
 * distinct branch+설비명 pairs straight out of registered failure history. */
export async function listEquipmentSummary(branch?: string): Promise<EquipmentSummaryRow[]> {
  let query = supabase.from("failure_history").select("*").not("equipment_name", "is", null).neq("equipment_name", "");
  if (branch) query = query.ilike("branch", `${branch}%`);
  const rows = unwrap(await query) as FailureHistoryRow[];

  // Keyed on JSON (not a plain joined string) so branch/equipment names that
  // themselves contain spaces don't get misparsed back apart.
  const groups = new Map<string, { branch: string; equipmentName: string; rows: FailureHistoryRow[] }>();
  for (const row of rows) {
    const rowBranch = row.branch ?? "";
    const equipmentName = row.equipment_name ?? "";
    const key = JSON.stringify([rowBranch, equipmentName]);
    const group = groups.get(key) ?? { branch: rowBranch, equipmentName, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  const summaries: EquipmentSummaryRow[] = [];
  for (const { branch: rowBranch, equipmentName, rows: list } of groups.values()) {
    const sorted = [...list].sort((a, b) => (a.occurred_at ?? "") < (b.occurred_at ?? "") ? 1 : -1);
    summaries.push({
      branch: rowBranch,
      equipmentName,
      count: list.length,
      lastOccurredAt: sorted[0]?.occurred_at ?? null,
      lastStatus: sorted[0]?.status ?? null,
    });
  }

  return summaries.sort((a, b) => b.count - a.count);
}
