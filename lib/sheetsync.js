// Dashboard → sheet: after a sign-up or upsell is logged or removed, the month's numbers are written into
// "Lahore Sales Target.xlsx" in Drive. Each run recalculates the whole month from the logged entries, so it's
// always right even if an earlier run failed. Only typed-in cells are written, never formulas:
//   each agent's Sign-Ups and Account/Sale ("2/1"), targets changed in Settings, the team Total row, the floor's Achieved,
//   and each week's Achieved, Accounts/Sales, Remaining, MRR Revenue (new sign-ups) and Upsell Revenue.
// Agents added only in Settings aren't in the sheet, so they're listed in the log instead.
import { hGet, hSet } from "@/lib/store";
import { driveConnection, downloadFile, uploadFile, fileModifiedTime } from "@/lib/drive";
import { readWorkbook, writeCells } from "@/lib/xlsx";
import { parseMonth } from "@/lib/parse";
import { listEntries, applyEntries, isLogMonth } from "@/lib/entries";
import { getRoster, applyRoster } from "@/lib/roster";

const SETTINGS = "st:settings";
const split = (x) => (x.accounts || x.sales ? `${x.accounts || 0}/${x.sales || 0}` : 0);

export async function lastSync() {
  return (await hGet(SETTINGS, "sheetSync").catch(() => null)) || null;
}

// The cells to write for one month: { "D87": 3, "E87": "2/1", … }, plus agents with no row in the sheet.
export function monthCells(month, entries, roster = { added: [], removed: [], targets: [] }) {
  const view = applyEntries(applyRoster(month, { ...roster, removed: [] }), entries); // removed agents keep their sheet row
  const values = {}, notInSheet = [];
  for (const t of view.teams) {
    for (const a of t.agents) {
      if (!a.cells) { if (a.signups || a.revenue) notInSheet.push(`${a.name} (${t.name})`); continue; }
      values[a.cells.signups] = a.signups;
      if (a.targetSet && a.target != null) values[a.cells.target] = a.target;
      values[a.cells.split] = split(a);
    }
    if (t.totalCells) { values[t.totalCells.signups] = t.signups; values[t.totalCells.split] = split(t); if (t.totalCells.target) values[t.totalCells.target] = t.target; }
  }
  if (month.floor.cells) values[month.floor.cells.achieved] = view.floor.achieved;
  for (const w of view.weeks) {
    const c = month.weeks.find((x) => x.n === w.n)?.cells;
    if (!c) continue;
    if (c.achieved) values[c.achieved] = w.achieved;
    if (c.split) values[c.split] = split(w);
    if (c.remaining && w.target) values[c.remaining] = w.target - w.achieved;
    if (c.mrr) values[c.mrr] = Math.round((w.revenue - w.upsell) * 100) / 100;
    if (c.upsell) values[c.upsell] = Math.round(w.upsell * 100) / 100;
  }
  return { values, notInSheet };
}

// Writes one month into the sheet. If someone saves the file while this runs, it starts again from their version
// so their edit isn't lost. Never throws: the result is kept for Settings ("Sheet sync").
export async function syncMonth(title, by = null) {
  const log = { at: new Date().toISOString(), month: title, by };
  try {
    if (!isLogMonth(title)) throw new Error(`${title} isn't a logged month.`);
    const conn = await driveConnection();
    if (!conn?.refreshToken) throw new Error("Google Drive isn't connected.");
    if (!conn.canWrite) throw new Error("Google Drive is connected for reading only. Reconnect Google Drive in Settings to let the app write to the sheet.");
    const entries = await listEntries(title);
    const roster = await getRoster(title);
    for (let attempt = 1; ; attempt++) {
      const file = await downloadFile();
      const grid = readWorkbook(file.bytes)[title];
      if (!grid) throw new Error(`The sheet has no "${title}" tab.`);
      const { values, notInSheet } = monthCells(parseMonth(title, grid), entries, roster);
      const out = writeCells(file.bytes, title, values);
      if ((await fileModifiedTime()) !== file.modifiedTime && attempt < 3) continue; // edited meanwhile: redo on top of it
      await uploadFile(out.bytes);
      Object.assign(log, { ok: true, cells: out.written.length, skipped: out.formula.length + out.missing.length, notInSheet });
      break;
    }
  } catch (e) {
    Object.assign(log, { ok: false, error: e.message });
  }
  await hSet(SETTINGS, "sheetSync", log).catch(() => {});
  return log;
}
