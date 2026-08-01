import { supabase } from "./supabase";
import {
  getConfigOptional,
  getYouTubeMonthsForShortcode,
  setConfig,
} from "./youtube-subscription";

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

function dayBefore(date: string): string {
  const d = new Date(`${normalizeDate(date)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function resolveFeeForMonth(
  schedules: YoutubeFeeSchedule[],
  month: string,
): number {
  const start = normalizeDate(month);
  // Bill each subscription month at the rate locked on the last day of the prior month.
  // A fee effective 2026-07-01 applies from the August row onward; July stays at the old rate.
  const rateAsOf = dayBefore(start);
  const active = getActiveFeeScheduleForDate(schedules, rateAsOf);

  if (!active) {
    throw new Error(
      `No YouTube fee schedule covers ${start.slice(0, 7)}. Add one with /addytfee.`,
    );
  }

  return active.fee;
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

export const YOUTUBE_FEE_ANNOUNCED_CONFIG_KEY =
  "youtube_announced_fee_schedule_id";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function formatFeeEffectiveMonth(date: string): string {
  const [year, month] = date.split("-").map(Number);
  return `${MONTH_LABELS[month - 1]} ${year}`;
}

export function getActiveFeeScheduleForDate(
  schedules: YoutubeFeeSchedule[],
  date: string,
): YoutubeFeeSchedule | null {
  const matches = schedules.filter(
    (s) =>
      s.effective_from <= date &&
      (s.effective_to === null || s.effective_to >= date),
  );

  if (matches.length === 0) return null;

  matches.sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return matches[0];
}

export function getPriorFeeSchedule(
  schedules: YoutubeFeeSchedule[],
  active: YoutubeFeeSchedule,
): YoutubeFeeSchedule | null {
  const prior = schedules
    .filter((s) => s.effective_from < active.effective_from)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));

  return prior[0] ?? null;
}

export function formatNewFeeAnnouncement(
  schedule: YoutubeFeeSchedule,
  previous: YoutubeFeeSchedule,
): string {
  const fee = `$${schedule.fee.toFixed(2)}`;
  const prevFee = `$${previous.fee.toFixed(2)}`;
  const effective = formatFeeEffectiveMonth(schedule.effective_from);
  return `📢 New YouTube monthly fee: <b>${fee}</b> (was ${prevFee}) — effective ${effective}`;
}

export interface YoutubeFeeAnnouncementResult {
  text: string | null;
  /** Set after a successful cron send to record first-time announcement. */
  scheduleIdToMark: number | null;
}

export async function resolveYoutubeFeeAnnouncement(
  asOf: Date = new Date(),
): Promise<YoutubeFeeAnnouncementResult> {
  const [schedules, announcedRaw] = await Promise.all([
    getYoutubeFeeSchedules(),
    getConfigOptional(YOUTUBE_FEE_ANNOUNCED_CONFIG_KEY),
  ]);

  const today = asOf.toISOString().slice(0, 10);
  const active = getActiveFeeScheduleForDate(schedules, today);
  if (!active) return { text: null, scheduleIdToMark: null };

  const announcedId = announcedRaw ? parseInt(announcedRaw, 10) : null;

  if (announcedId === null) {
    return { text: null, scheduleIdToMark: active.id };
  }

  if (announcedId === active.id) {
    return { text: null, scheduleIdToMark: null };
  }

  const previous = getPriorFeeSchedule(schedules, active);
  if (!previous || previous.fee === active.fee) {
    return { text: null, scheduleIdToMark: active.id };
  }

  return {
    text: formatNewFeeAnnouncement(active, previous),
    scheduleIdToMark: active.id,
  };
}

export async function markYoutubeFeeScheduleAnnounced(
  scheduleId: number,
): Promise<void> {
  await setConfig(YOUTUBE_FEE_ANNOUNCED_CONFIG_KEY, String(scheduleId));
}
