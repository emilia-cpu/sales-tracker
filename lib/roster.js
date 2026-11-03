// Admin changes to a month's teams (Settings → Teams & agents): agents added to a team, and sheet agents
// removed from it. Kept per month in Redis; the sheet itself is never changed. Applied on top of the sheet's
// roster before sign-ups are counted, so the dashboard and the "Log a sign-up" form both follow it.
import { hGet, hSet } from "@/lib/store";
import { monthKey } from "@/lib/parse";

const KEY = "st:roster";
export const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

// { added: [{ team, agent, target, by, at }], removed: [{ team, agent, by, at }] }
export async function getRoster(title) {
  const r = (await hGet(KEY, String(monthKey(title))).catch(() => null)) || {};
  return { added: r.added || [], removed: r.removed || [] };
}

export async function saveRoster(title, r) {
  await hSet(KEY, String(monthKey(title)), { added: r.added, removed: r.removed });
}

// The parsed month with the admin's changes: removed agents left out, added agents put in (0 sign-ups).
export function applyRoster(month, r) {
  if (!r.added.length && !r.removed.length) return month;
  const teams = month.teams.map((t) => {
    const agents = t.agents
      .filter((a) => !r.removed.some((x) => same(x.team, t.name) && same(x.agent, a.name)))
      .concat(r.added.filter((x) => same(x.team, t.name) && !t.agents.some((a) => same(a.name, x.agent)))
        .map((x) => ({ name: x.agent, target: x.target ?? null, signups: 0, accounts: 0, sales: 0, added: true })));
    const sum = (f) => agents.reduce((s, x) => s + (x[f] || 0), 0);
    return { ...t, agents, target: sum("target"), signups: sum("signups"), accounts: sum("accounts"), sales: sum("sales") };
  });
  const sum = (f) => teams.reduce((s, x) => s + x[f], 0);
  return { ...month, teams, totals: { target: sum("target"), signups: sum("signups"), accounts: sum("accounts"), sales: sum("sales") } };
}
