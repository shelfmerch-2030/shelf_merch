export type SendMode = "redeem" | "surprise" | "single";

export type PaymentMethod = "wallet" | "upi" | "card";

export type WhenMode = "now" | "sched" | "self";

export type SingleLocation = {
  name: string;
  email: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
};

export type ScheduleDraft = { date: string; time: string; tz: string };

export const EMPTY_SINGLE_LOCATION: SingleLocation = {
  name: "",
  email: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
  country: "IN",
};

function ianaTimeZone(tzLabel: string): string {
  return (tzLabel || "Asia/Kolkata").trim().split(/\s+/)[0] || "Asia/Kolkata";
}

function normalizeClockTime(time: string): string {
  const parts = String(time || "10:00").split(":");
  const h = String(parts[0] ?? "10").padStart(2, "0");
  const m = String(parts[1] ?? "00").padStart(2, "0");
  const s = String(parts[2] ?? "00").replace(/\D.*/, "").padStart(2, "0").slice(0, 2);
  return `${h}:${m}:${s}`;
}

function tzOffsetMs(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  let hour = get("hour");
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/** Wall-clock date/time in `timeZone` → UTC ISO instant. */
export function zonedWallTimeToIso(date: string, time: string, timeZone: string): string {
  const tz = ianaTimeZone(timeZone);
  const clock = normalizeClockTime(time);
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second] = clock.split(":").map(Number);
  if (![year, month, day, hour, minute, second].every((n) => Number.isFinite(n))) {
    return new Date(Date.now() + 86_400_000).toISOString();
  }
  const desiredUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  let utcMs = desiredUtcMs - tzOffsetMs(tz, new Date(desiredUtcMs));
  utcMs = desiredUtcMs - tzOffsetMs(tz, new Date(utcMs));
  return new Date(utcMs).toISOString();
}

/** Convert the wizard's draft schedule into the api-bridge schedule payload. */
export function toSchedulePayload(
  when: WhenMode,
  sched: ScheduleDraft,
): { mode: "now" | "scheduled" | "self"; sendAt?: string | null; timezone?: string } {
  if (when === "self") return { mode: "self" };
  if (when === "sched") {
    const date = sched.date || new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const time = sched.time || "10:00";
    const tz = ianaTimeZone(sched.tz || "Asia/Kolkata (IST)");
    return {
      mode: "scheduled",
      sendAt: zonedWallTimeToIso(date, time, tz),
      timezone: tz,
    };
  }
  return { mode: "now" };
}
