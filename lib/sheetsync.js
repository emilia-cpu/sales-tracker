// Dashboard → sheet: after a sign-up or upsell is logged or removed, the month's numbers are written into
// "Lahore Sales Target.xlsx" in Drive. Each run recalculates the whole month from the logged entries, so it's
// always right even if an earlier run failed. Only typed-in cells are written, never formulas:
//   each agent's Sign-Ups and Account/Sale ("2/1"), targets changed in Settings, the team Total row, the floor's Achieved,
//   and each week's Achieved, Accounts/Sales, Remaining, MRR Revenue (new sign-ups) and Upsell Revenue.
// Agents added only in Settings aren't in the sheet, so they're listed in the log instead.
// Every change marks the month as "behind" (markDirty); a write that fails is retried on the next dashboard visit.
import { hGet, hSet } from "@/lib/store";
import { driveConnection, downloadFile, uploadFile, fileModifiedTime } from "@/lib/drive";
import { readWorkbook, writeCells, formulaCells } from "@/lib/xlsx";
import { parseMonth, num, splitAS } from "@/lib/parse";
import { listEntries, applyEntries, isLogMonth } from "@/lib/entries";
import { getRoster, applyRoster } from "@/lib/roster";

const SETTINGS = "st:settings";
const split = (x) => (x.accounts || x.sales ? `${x.accounts || 0}/${x.sales || 0}` : 0);

export async function lastSync() {
  return (await hGet(SETTINGS, "sheetSync").catch(() => null)) || null;
}

// { "November 2026": { changed, written, tried } } — when the month last changed, was last written in full, last attempted.
const state = async () => (await hGet(SETTINGS, "sheetState").catch(() => null)) || {};
async function setState(title, patch) {
  const s = await state();
  s[title] = { ...(s[title] || {}), ...patch };
  await hSet(SETTINGS, "sheetState", s).catch(() => {});
}

// Called with every change that should reach the sheet.
export async function markDirty(title) {
  await setState(title, { changed: new Date().toISOString() });
}

// True when the month changed after its last full write and no write was tried in the last minute.
export async function needsSync(title) {
  const s = (await state())[title];
  if (!s?.changed) return false;
  if (s.written && s.written >= s.changed) return false;
  return !s.tried || Date.now() - Date.parse(s.tried) > 60000;
}

// The cells to write for one month: { "D87": 3, "E87": "2/1", … }, plus agents with no row in the sheet.
// labels says what each cell is ({ where, what }); "derived" ones (team totals, remaining) may be formulas in the sheet.
export function monthCells(month, entries, roster = { added: [], removed: [], targets: [] }) {
  const view = applyEntries(applyRoster(month, { ...roster, removed: [] }), entries); // removed agents keep their sheet row
  const values = {}, labels = {}, notInSheet = [];
  const set = (ref, value, where, what, kind, derived = false) => { values[ref] = value; labels[ref] = { where, what, kind, derived }; };
  for (const t of view.teams) {
    for (const a of t.agents) {
      if (!a.cells) { if (a.signups || a.revenue) notInSheet.push(`${a.name} (${t.name})`); continue; }
      set(a.cells.signups, a.signups, t.name, `${a.name} · Sign-ups`, "n");
      if (a.targetSet && a.target != null) set(a.cells.target, a.target, t.name, `${a.name} · Target`, "n");
      set(a.cells.split, split(a), t.name, `${a.name} · Accounts / Sales`, "split");
    }
    if (t.totalCells) {
      set(t.totalCells.signups, t.signups, t.name, "Total · Sign-ups", "n", true);
      set(t.totalCells.split, split(t), t.name, "Total · Accounts / Sales", "split", true);
      if (t.totalCells.target) set(t.totalCells.target, t.target, t.name, "Total · Target", "n", true);
    }
  }
  if (month.floor.cells) set(month.floor.cells.achieved, view.floor.achieved, "Floor", "Achieved sign-ups", "n");
  for (const w of view.weeks) {
    const c = month.weeks.find((x) => x.n === w.n)?.cells;
    if (!c) continue;
    const wk = `Week ${w.n}`;
    if (c.achieved) set(c.achieved, w.achieved, wk, "Achieved", "n");
    if (c.split) set(c.split, split(w), wk, "Accounts / Sales", "split");
    if (c.remaining && w.target) set(c.remaining, w.target - w.achieved, wk, "Remaining", "n", true);
    if (c.mrr) set(c.mrr, Math.round((w.revenue - w.upsell) * 100) / 100, wk, "MRR revenue", "usd");
    if (c.upsell) set(c.upsell, Math.round(w.upsell * 100) / 100, wk, "Upsell revenue", "usd");
  }
  return { values, labels, notInSheet };
}

// Cell text at "D87" in a grid of rows.
function at(grid, ref) {
  const [, col, row] = ref.match(/^([A-Z]+)(\d+)$/);
  let c = 0;
  for (const ch of col) c = c * 26 + ch.charCodeAt(0) - 64;
  return String(grid[+row - 1]?.[c - 1] ?? "").trim();
}

// Do the sheet's text and the dashboard's value say the same thing? Blank counts as 0.
function agrees(text, value, kind) {
  if (kind === "split") {
    const a = splitAS(text) || (text === "" ? { accounts: 0, sales: 0 } : null);
    const b = value === 0 ? { accounts: 0, sales: 0 } : splitAS(value);
    return !!a && a.accounts === b.accounts && a.sales === b.sales;
  }
  return Math.abs((num(text) ?? (text === "" ? 0 : NaN)) - value) < 0.005;
}

// Settings → "Compare now": the month in the sheet (read fresh from Drive) against the dashboard. Lists every cell
// that differs. Team totals and remaining are left out, and so is any cell the sheet calculates with a formula
// (those are listed as "calculated" instead, since the app never writes them).
export async function compareMonth(title) {
  if (!isLogMonth(title)) throw new Error(`${title} is read from the sheet, so there's nothing to compare.`);
  const [file, entries, roster] = await Promise.all([downloadFile(), listEntries(title), getRoster(title)]);
  const grid = readWorkbook(file.bytes)[title];
  if (!grid) throw new Error(`The sheet has no "${title}" tab.`);
  const { values, labels, notInSheet } = monthCells(parseMonth(title, grid), entries, roster);
  const formulas = formulaCells(file.bytes, title);
  const diffs = [], calculated = [];
  let checked = 0;
  for (const [ref, value] of Object.entries(values)) {
    const l = labels[ref];
    if (l.derived) continue;
    if (formulas.has(ref)) { calculated.push({ ref, where: l.where, what: l.what }); continue; }
    checked++;
    let text = at(grid, ref);
    if (l.kind === "split" && splitAS(text)) { const s = splitAS(text); text = `${s.accounts}/${s.sales}`; } // "46023" (a date) → "1/1"
    if (!agrees(text, value, l.kind)) diffs.push({ ref, where: l.where, what: l.what, kind: l.kind, sheet: text, dashboard: value });
  }
  return { month: title, checked, diffs, calculated, notInSheet, sheetEdited: file.modifiedTime, at: new Date().toISOString() };
}

// Writes one month into the sheet. If someone saves the file while this runs, it starts again from their version
// so their edit isn't lost. Never throws: the result is kept for Settings ("Sheet sync").
export async function syncMonth(title, by = null) {
  const log = { at: new Date().toISOString(), month: title, by };
  await setState(title, { tried: log.at });
  try {
    if (!isLogMonth(title)) throw new Error(`${title} isn't a logged month.`);
    const conn = await driveConnection();
    if (!conn?.refreshToken) throw new Error("Google Drive isn't connected.");
    if (!conn.canWrite) throw new Error("Google Drive is connected for reading only. Reconnect Google Drive in Settings to let the app write to the sheet.");
    for (let attempt = 1; ; attempt++) {
      const entries = await listEntries(title), roster = await getRoster(title); // fresh on each try
      const file = await downloadFile();
      const grid = readWorkbook(file.bytes)[title];
      if (!grid) throw new Error(`The sheet has no "${title}" tab.`);
      const { values, notInSheet } = monthCells(parseMonth(title, grid), entries, roster);
      const out = writeCells(file.bytes, title, values);
      if ((await fileModifiedTime()) !== file.modifiedTime && attempt < 3) continue; // edited meanwhile: redo on top of it
      await uploadFile(out.bytes);
      Object.assign(log, { ok: true, cells: out.written.length, skipped: out.formula.length + out.missing.length, notInSheet });
      await setState(title, { written: log.at }); // everything changed before this run started is now in the sheet
      break;
    }
  } catch (e) {
    Object.assign(log, { ok: false, error: e.message });
  }
  await hSet(SETTINGS, "sheetSync", log).catch(() => {});
  return log;
}
