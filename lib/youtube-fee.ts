import { supabase } from "./supabase";
import { getYouTubeMonthsForShortcode } from "./youtube-subscription";

export interface YoutubeFeeSchedule {
  id: number;
  fee: number;
  effective_from: string;
  effective_to: string | null;
}

export interface YoutubeMonthCharge {
  month: string;
  fee: number;
}

export interface YoutubeOwing {
  months: YoutubeMonthCharge[];
  total: number;
}

/** Normalize YYYY-MM or YYYY-MM-DD to a date string. */
export function normalizeDate(date: string): string {
  const trimmed = date.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
  throw new Error("Date must be YYYY-MM or YYYY-MM-DD.");
}

export function isDateToken(token: string): boolean {
  return /^\d{4}-\d{2}(-\d{2})?$/.test(token.trim());
}

function subscriptionMonthRange(month: string): { start: string; end: string } {
  const start = normalizeDate(month);
  const [year, monthNum] = start.split("-").map(Number);
  const end = new Date(Date.UTC(year, monthNum, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function scheduleCoversSubscriptionMonth(
  schedule: YoutubeFeeSchedule,
  monthStart: string,
  monthEnd: string,
): boolean {
  return (
    schedule.effective_from <= monthEnd &&
    (schedule.effective_to === null || schedule.effective_to >= monthStart)
  );
}

function dayBefore(date: string): string {
  const d = new Date(`${normalizeDate(date)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function resolveFeeForMonth(
  schedules: YoutubeFeeSchedule[],
  month: string,
): number {
  const { start, end } = subscriptionMonthRange(month);
  const matches = schedules.filter((s) =>
    scheduleCoversSubscriptionMonth(s, start, end),
  );

  if (matches.length === 0) {
    throw new Error(
      `No YouTube fee schedule covers ${start.slice(0, 7)}. Add one with /addytfee.`,
    );
  }

  matches.sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return matches[0].fee;
}

export function sumMonthCharges(
  monthRecords: { month: string; paid?: boolean }[],
  schedules: YoutubeFeeSchedule[],
  unpaidOnly = true,
): YoutubeOwing {
  const months: YoutubeMonthCharge[] = [];

  for (const record of monthRecords) {
    if (unpaidOnly && record.paid) continue;
    months.push({
      month: record.month,
      fee: resolveFeeForMonth(schedules, record.month),
    });
  }

  const total = months.reduce((sum, m) => sum + m.fee, 0);
  return { months, total };
}

export function formatYoutubeMonthSummary(owing: YoutubeOwing): string {
  if (owing.months.length === 0) return "";

  const fees = new Set(owing.months.map((m) => m.fee));
  const count = owing.months.length;

  if (fees.size === 1) {
    const fee = owing.months[0].fee;
    return `${count} month(s) × $${fee.toFixed(2)}/month`;
  }

  const breakdown = owing.months
    .map((m) => `${m.month.slice(0, 7)} × $${m.fee.toFixed(2)}`)
    .join(", ");
  return `${count} month(s) — $${owing.total.toFixed(2)} total (${breakdown})`;
}

export async function getYoutubeFeeSchedules(): Promise<YoutubeFeeSchedule[]> {
  const { data, error } = await supabase
    .from("youtube_fee_schedules")
    .select("id, fee, effective_from, effective_to")
    .order("effective_from", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch YouTube fee schedules: ${error.message}`);
  }

  return ((data ?? []) as { id: number; fee: number | string; effective_from: string; effective_to: string | null }[]).map(
    (row) => ({
      id: row.id,
      fee: Number(row.fee),
      effective_from: row.effective_from,
      effective_to: row.effective_to,
    }),
  );
}

export async function getCurrentYoutubeMonthlyFee(
  asOf = new Date(),
): Promise<number> {
  const schedules = await getYoutubeFeeSchedules();
  const today = asOf.toISOString().slice(0, 10);
  const matches = schedules.filter(
    (s) =>
      s.effective_from <= today &&
      (s.effective_to === null || s.effective_to >= today),
  );

  if (matches.length === 0) {
    throw new Error(
      `No YouTube fee schedule covers ${today}. Add one with /addytfee.`,
    );
  }

  matches.sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return matches[0].fee;
}

export async function getUnpaidYoutubeOwing(
  shortcode: string,
  monthFilters?: string[],
): Promise<YoutubeOwing> {
  const [months, schedules] = await Promise.all([
    getYouTubeMonthsForShortcode(shortcode),
    getYoutubeFeeSchedules(),
  ]);

  let unpaid = months.filter((m) => !m.paid);
  if (monthFilters?.length) {
    unpaid = unpaid.filter((m) =>
      monthFilters.some((f) => m.month.startsWith(f)),
    );
  }

  return sumMonthCharges(unpaid, schedules, false);
}

export function formatReminderMonthFeeSuffix(
  charges: YoutubeMonthCharge[],
): string {
  if (charges.length === 0) return "";
  const fees = new Set(charges.map((c) => c.fee));
  if (fees.size === 1) {
    return ` × $${charges[0].fee.toFixed(2)}`;
  }
  return "";
}

export function formatReminderMonthFeeBreakdown(
  charges: YoutubeMonthCharge[],
): string | null {
  const fees = new Set(charges.map((c) => c.fee));
  if (fees.size <= 1) return null;

  const byFee = new Map<number, number>();
  for (const charge of charges) {
    byFee.set(charge.fee, (byFee.get(charge.fee) ?? 0) + 1);
  }

  return [...byFee.entries()]
    .sort(([feeA], [feeB]) => feeA - feeB)
    .map(([fee, count]) => {
      const label = count === 1 ? "1 month" : `${count} months`;
      return `${label} × $${fee.toFixed(2)}`;
    })
    .join(" · ");
}

export interface YoutubeReminderMember {
  id: string;
  months: YoutubeMonthCharge[];
  total: number;
}

export async function getYoutubeReminderOwings(): Promise<
  YoutubeReminderMember[]
> {
  const [{ data: unpaidRows }, schedules] = await Promise.all([
    supabase
      .from("youtube_subscription_months")
      .select("shortcode, month")
      .eq("paid", false),
    getYoutubeFeeSchedules(),
  ]);

  const byCode = new Map<string, { month: string }[]>();
  for (const row of (unpaidRows ?? []) as { shortcode: string; month: string }[]) {
    const list = byCode.get(row.shortcode) ?? [];
    list.push({ month: row.month });
    byCode.set(row.shortcode, list);
  }

  return [...byCode.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, months]) => {
      const owing = sumMonthCharges(months, schedules, false);
      return { id, months: owing.months, total: owing.total };
    });
}

export async function addYoutubeFeeSchedule(
  fee: number,
  effectiveFrom: string,
  effectiveTo?: string | null,
): Promise<YoutubeFeeSchedule> {
  if (fee < 0 || Number.isNaN(fee)) {
    throw new Error("Fee must be a non-negative number.");
  }

  const from = normalizeDate(effectiveFrom);
  const to = effectiveTo ? normalizeDate(effectiveTo) : null;
  if (to && to < from) {
    throw new Error("Expiry date must be on or after effective date.");
  }

  const expiryForPrevious = dayBefore(from);
  const { error: closeError } = await supabase
    .from("youtube_fee_schedules")
    .update({ effective_to: expiryForPrevious })
    .is("effective_to", null)
    .lt("effective_from", from);

  if (closeError) {
    throw new Error(
      `Failed to close previous YouTube fee schedule: ${closeError.message}`,
    );
  }

  const { data, error } = await supabase
    .from("youtube_fee_schedules")
    .insert({
      fee,
      effective_from: from,
      effective_to: to,
    })
    .select("id, fee, effective_from, effective_to")
    .single();

  if (error) {
    throw new Error(`Failed to add YouTube fee schedule: ${error.message}`);
  }

  const row = data as {
    id: number;
    fee: number | string;
    effective_from: string;
    effective_to: string | null;
  };

  return {
    id: row.id,
    fee: Number(row.fee),
    effective_from: row.effective_from,
    effective_to: row.effective_to,
  };
}

export function formatFeeScheduleLine(schedule: YoutubeFeeSchedule): string {
  const fee = `$${schedule.fee.toFixed(2)}`;
  const from = schedule.effective_from;
  const to = schedule.effective_to ?? "ongoing";
  return `#${schedule.id} ${fee}/mo from ${from} to ${to}`;
}
