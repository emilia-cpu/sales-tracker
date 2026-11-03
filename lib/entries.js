// Sign-ups logged on the dashboard ("Log a sign-up"): one entry per sale or account, with team, agent, client and
// (optionally) the revenue in dollars.
// From November 2026 on, these entries are the sign-up count. The sheet still gives teams, agents and targets,
// and its own Sign-Ups / Account/Sale cells are ignored for those months. Earlier months use the sheet as it is.
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

export async function removeEntry(title, id) {
  await hSet(key(title), id, null);
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

// The parsed month with sign-ups replaced by the logged entries. Entries for an agent who is no longer in the
// sheet still count: they show as an extra agent in that team (no target).
export function applyEntries(month, entries) {
  const k = monthKey(month.title), y = Math.floor(k / 100), m = k % 100;
  const teams = month.teams.map((t) => ({ ...t, agents: t.agents.map((a) => ({ ...a, signups: 0, accounts: 0, sales: 0, revenue: 0 })) }));
  for (const e of entries) {
    let t = teams.find((x) => x.name === e.team);
    if (!t) { t = { name: e.team, leader: e.team, agents: [] }; teams.push(t); }
    let a = t.agents.find((x) => x.name === e.agent);
    if (!a) { a = { name: e.agent, target: null, signups: 0, accounts: 0, sales: 0, revenue: 0 }; t.agents.push(a); }
    a.signups++;
    a.revenue += e.revenue || 0;
    a[e.type === "sale" ? "sales" : "accounts"]++;
  }
  for (const t of teams) {
    const sum = (f) => t.agents.reduce((s, x) => s + (x[f] || 0), 0);
    Object.assign(t, { target: sum("target"), signups: sum("signups"), accounts: sum("accounts"), sales: sum("sales"), revenue: sum("revenue") });
  }
  const sum = (f) => teams.reduce((s, x) => s + x[f], 0);

  const ranges = weekRanges(month.title);
  const weeks = ranges.map((r, i) => {
    const sheet = month.weeks.find((w) => w.n === i + 1) || {};
    const inWeek = entries.filter((e) => { const p = ptDay(e.at); return p.y === y && p.m === m && p.d >= r.from && p.d <= r.to; });
    return {
      ...sheet,
      n: i + 1,
      target: sheet.target || 0,
      achieved: inWeek.length,
      accounts: inWeek.filter((e) => e.type !== "sale").length,
      sales: inWeek.filter((e) => e.type === "sale").length,
      revenue: inWeek.reduce((s, e) => s + (e.revenue || 0), 0),
      range: `${r.from === r.to ? "" : `${r.from}–`}${r.to}`,
    };
  });

  return {
    ...month,
    teams,
    weeks,
    floor: { ...month.floor, achieved: entries.length },
    totals: { target: sum("target"), signups: sum("signups"), accounts: sum("accounts"), sales: sum("sales"), revenue: sum("revenue") },
    logged: true,
    entries,
  };
}
