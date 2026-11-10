// Settings → "Check earlier versions": goes through the saved versions of the sales file and lists every place an
// agent's Sign-Ups or Account/Sale went DOWN from one version to the next. Between the first automatic writes
// (2026-11-03) and the switch to adding (deltaFrom), each write set agents' cells to the dashboard's count, so a number
// typed into the sheet could be replaced; a drop is what that looks like. Drops by people show up too, so each row
// says who saved that version.
import { listRevisions, downloadRevision } from "@/lib/drive";
import { readWorkbook } from "@/lib/xlsx";
import { parseMonth } from "@/lib/parse";

export const WRITES_FROM = "2026-11-03T19:00:00Z"; // the first automatic write to the sheet
const MAX_VERSIONS = 60;

// { "Team|Agent": { team, agent, signups, accounts, sales } } for one version of the month's tab.
function agents(bytes, title) {
  const grid = readWorkbook(bytes)[title];
  if (!grid) return null;
  const out = {};
  for (const t of parseMonth(title, grid).teams) for (const a of t.agents)
    out[`${t.name}|${a.name}`] = { team: t.name, agent: a.name, signups: a.signups || 0, accounts: a.accounts || 0, sales: a.sales || 0 };
  return out;
}

export async function sheetHistory(title, until) {
  const all = await listRevisions();
  // The last version before the writes started is the starting point; then every version up to "until".
  const start = all.filter((r) => r.modifiedTime < WRITES_FROM).pop();
  const window = all.filter((r) => r.modifiedTime >= WRITES_FROM && (!until || r.modifiedTime <= until));
  const versions = (start ? [start, ...window] : window).slice(-MAX_VERSIONS - 1);
  const drops = [];
  let prev = null, checked = 0;
  for (const v of versions) {
    const now = agents(await downloadRevision(v.id), title);
    checked++;
    if (prev && now) for (const [k, b] of Object.entries(prev)) {
      const a = now[k];
      if (!a) continue;
      if (a.signups < b.signups || a.accounts < b.accounts || a.sales < b.sales)
        drops.push({ at: v.modifiedTime, by: v.by, version: v.id, team: b.team, agent: b.agent, before: `${b.signups} (${b.accounts}/${b.sales})`, after: `${a.signups} (${a.accounts}/${a.sales})` });
    }
    if (now) prev = now;
  }
  return { month: title, from: versions[0]?.modifiedTime || null, until: until || null, versions: checked, totalVersions: all.length, truncated: window.length > MAX_VERSIONS, drops };
}
