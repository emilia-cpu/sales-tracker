// Sign-ups logged on the dashboard ("Log a sign-up"): one entry per sale or account, with team, agent, client and
// the revenue in dollars. Admins also add upsells on a client: an "upsell" entry in the month it happens, pointing at
// the client's sign-up (of / ofMonth). Upsells add revenue but aren't sign-ups.
// From November 2026 the team can use both the dashboard and the sheet. The sheet holds the totals; each logged
// entry is added to it once by lib/sheetsync.js (appliedAt), and removing one takes it back off (a "removed" entry
// waits until that's done). Until then the dashboard adds it on top of the sheet's numbers ("pending").
import { hGetAll, hSet, hGet } from "@/lib/store";
import { monthKey } from "@/lib/parse";
import { TZ } from "@/lib/time";

export const LOG_FROM = 202611; // November 2026
export const isLogMonth = (title) => (monthKey(title) || 0) >= LOG_FROM;
const key = (title) => `st:entries:${monthKey(title)}`;

export async function listEntries(title) {
  return Object.values(await hGetAll(key(title))).sort((a, b) => b.at.localeCompare(a.at));
}

export async function addEntry(title, entry) {
  const e = { id: crypto.randomUUID(), at: new Date().toISOString(), ...entry };
  await hSet(key(title), e.id, e);
  return e;
}

export async function getEntry(title, id) {
  return hGet(key(title), id);
}

// An entry already added to the sheet stays as "removed" until the sheet sync has taken it back off.
export async function removeEntry(title, id, deltaFrom) {
  const e = await getEntry(title, id);
  if (!e) return;
  if (inSheet(e, deltaFrom)) await hSet(key(title), id, { ...e, removed: true, removedAt: new Date().toISOString() });
  else await hSet(key(title), id, null);
}

// Updates entries after the sheet sync: { id: { appliedAt } } or { id: null } to forget one.
export async function patchEntries(title, patches) {
  for (const [id, patch] of Object.entries(patches)) {
    if (patch === null) { await hSet(key(title), id, null); continue; }
    const e = await getEntry(title, id);
    if (e) await hSet(key(title), id, { ...e, ...patch });
  }
}

// Entries logged before the switch to adding (deltaFrom) were already written into the sheet in full.
// An accepted entry (the admin let the sheet win) was never added, so it's not "in the sheet" either.
export const inSheet = (e, deltaFrom) => !e.acceptedAt && !!(e.appliedAt || (deltaFrom && e.at < deltaFrom));

// What an entry still has to do to the totals: +1 (logged, not in the sheet yet), -1 (removed, still in the sheet), or 0.
// hasRow: false for agents only added in Settings, who have no row in the sheet; their entries always count here.
export function pendingSign(e, deltaFrom, hasRow = true) {
  if (e.removed) return inSheet(e, deltaFrom) && hasRow ? -1 : 0;
  if (e.acceptedAt) return 0;
  return !hasRow || !inSheet(e, deltaFrom) ? 1 : 0;
}

// The week (1–5) an entry falls in, or 0 when it's outside the month.
export function weekOf(e, title) {
  const k = monthKey(title), p = ptDay(e.at);
  if (p.y !== Math.floor(k / 100) || p.m !== k % 100) return 0;
  return weekRanges(title).findIndex((r) => p.d >= r.from && p.d <= r.to) + 1;
}

// Pacific calendar day of an entry: { y, m, d }.
function ptDay(iso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(iso)).map((x) => [x.type, +x.value]));
  return { y: p.year, m: p.month, d: p.day };
}

// The month's weeks as day ranges, Monday to Sunday. A first stretch of 1–2 days joins the next week, and any
// days after week 5 join week 5, so a month always has at most 5 weeks like the sheet.
export function weekRanges(title) {
  const k = monthKey(title), y = Math.floor(k / 100), m = k % 100;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out = [];
  let from = 1;
  for (let d = 1; d <= days; d++) {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
    if (dow === 0 || d === days) {
      if (out.length === 0 && d - from + 1 < 3 && d < days) continue; // keep going: short first stretch
      out.push({ from, to: d });
      from = d + 1;
    }
  }
  while (out.length > 5) out[4].to = out.splice(5, 1)[0].to;
  return out;
}

export const isUpsell = (e) => e.type === "upsell";

// The month as the dashboard shows it: the sheet's numbers, plus entries not in the sheet yet (minus removed ones still
// in it). Agents' revenue is what's been logged here (the sheet has none per agent). Revenue includes upsells.
export function applyEntries(month, entries, revenueTarget = null, deltaFrom = null) {
  const n = (v) => v || 0;
  const teams = month.teams.map((t) => ({ ...t, agents: t.agents.map((a) => ({ ...a, signups: n(a.signups), accounts: n(a.accounts), sales: n(a.sales), revenue: 0, upsell: 0, logged: 0, pending: 0 })) }));
  const weeks = weekRanges(month.title).map((r, i) => {
    const w = month.weeks.find((x) => x.n === i + 1) || {};
    return { ...w, n: i + 1, target: n(w.target), achieved: n(w.achieved), accounts: n(w.accounts), sales: n(w.sales), mrr: n(w.mrr), upsell: n(w.upsell), range: `${r.from === r.to ? "" : `${r.from}–`}${r.to}` };
  });
  for (const e of entries) {
    let t = teams.find((x) => x.name === e.team);
    if (!t) { t = { name: e.team, leader: e.team, agents: [] }; teams.push(t); }
    let a = t.agents.find((x) => x.name === e.agent);
    if (!a) { a = { name: e.agent, target: null, signups: 0, accounts: 0, sales: 0, revenue: 0, upsell: 0, logged: 0, pending: 0 }; t.agents.push(a); }
    const sign = pendingSign(e, deltaFrom, !!a.cells);
    const rev = n(e.revenue), w = weeks[weekOf(e, month.title) - 1];
    if (!e.removed) { a.revenue += rev; if (isUpsell(e)) a.upsell += rev; else a.logged++; }
    if (!sign) continue;
    if (w) w[isUpsell(e) ? "upsell" : "mrr"] += sign * rev;
    if (isUpsell(e)) continue;
    a.signups += sign; a.pending += sign;
    a[e.type === "sale" ? "sales" : "accounts"] += sign;
    if (w) { w.achieved += sign; w[e.type === "sale" ? "sales" : "accounts"] += sign; }
  }
  for (const t of teams) {
    const sum = (f) => t.agents.reduce((s, x) => s + (x[f] || 0), 0);
    Object.assign(t, { target: sum("target"), signups: sum("signups"), accounts: sum("accounts"), sales: sum("sales"), revenue: sum("revenue"), upsell: sum("upsell") });
  }
  for (const w of weeks) w.revenue = w.mrr + w.upsell;
  const sum = (f) => teams.reduce((s, x) => s + x[f], 0);
  const wsum = (f) => weeks.reduce((s, x) => s + x[f], 0);
  return {
    ...month,
    teams,
    weeks,
    // The floor is the agents added up, so it's right even when the sheet's own total is a formula that hasn't recalculated.
    floor: { ...month.floor, achieved: sum("signups") },
    totals: { target: sum("target"), signups: sum("signups"), accounts: sum("accounts"), sales: sum("sales"), revenue: wsum("revenue"), upsell: wsum("upsell") },
    revenueTarget,
    logged: true,
    entries: entries.filter((e) => !e.removed),
  };
}
