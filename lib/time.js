// The team works on US Pacific time, so "today", due dates and charge dates all use it, wherever the viewer is.
export const TZ = "America/Los_Angeles";

// "2026-10-20" for the Pacific calendar day.
export function ptISO(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// "3:42 PM PDT" (PST in winter).
export function ptClock(d = new Date()) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(d);
}

// "November 2026" for the Pacific month, matching the sheet's tab names.
export function ptMonthTitle(d = new Date()) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "long", year: "numeric" }).format(d);
}
