// Dashboard ↔ sheet. The team can type into "Lahore Sales Target.xlsx" and log on the dashboard; neither overwrites
// the other. The sheet holds the totals. Each sign-up or upsell logged on the dashboard is ADDED to the sheet once
// (the agent's Sign-Ups and Account/Sale, the team Total row and the floor's Achieved where those are typed in, and
// the week's Achieved, Accounts/Sales, Remaining, MRR Revenue or Upsell Revenue), then marked appliedAt; removing one
// takes it back off. Targets changed in Settings are written as they are. Formulas that use other cells are never
// written. Only one sync runs at a time, and it keeps going until nothing is waiting.
// Agents added only in Settings have no row in the sheet, so their sign-ups stay on the dashboard only.
import { hGet, hSet, tryLock, unlock } from "@/lib/store";
import { driveConnection, downloadFile, uploadFile, fileModifiedTime } from "@/lib/drive";
import { readWorkbook, writeCells, formulaCells } from "@/lib/xlsx";
import { parseMonth, num, splitAS } from "@/lib/parse";
import { listEntries, patchEntries, isLogMonth, isUpsell, inSheet, pendingSign, weekOf } from "@/lib/entries";
import { getRoster, saveRoster, applyRoster } from "@/lib/roster";

const SETTINGS = "st:settings";

export async function lastSync() {
  return (await hGet(SETTINGS, "sheetSync").catch(() => null)) || null;
}

// When the app switched from writing whole numbers to adding entries. Entries logged before it were already written
// into the sheet in full. Set the first time it's asked for.
export async function deltaFrom() {
  const d = await hGet(SETTINGS, "deltaFrom").catch(() => null);
  if (d) return d;
  const now = new Date().toISOString();
  await hSet(SETTINGS, "deltaFrom", now).catch(() => {});
  return now;
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

// Cell text at "D87" in a grid of rows.
function at(grid, ref) {
  const [, col, row] = ref.match(/^([A-Z]+)(\d+)$/);
  let c = 0;
  for (const ch of col) c = c * 26 + ch.charCodeAt(0) - 64;
  return String(grid[+row - 1]?.[c - 1] ?? "").trim();
}

// The cells to change for one month: { ref: new value } built from the sheet as it is now plus every waiting entry,
// and what to record on those entries once it's saved. restore: also put back sign-ups the sheet is missing.
export function monthChanges(grid, month, entries, roster, from, { restore = false } = {}) {
  const sheet = applyRoster(month, { ...roster, removed: [] }); // removed agents keep their sheet row
  const add = {}, split = {}, set = {}, patches = {}, notInSheet = new Set();
  const bump = (ref, d) => { if (ref && d) add[ref] = (add[ref] || 0) + d; };
  const bumpSplit = (ref, type, d) => { if (!ref) return; const s = (split[ref] = split[ref] || { accounts: 0, sales: 0 }); s[type === "sale" ? "sales" : "accounts"] += d; };
  for (const e of entries) {
    const t = sheet.teams.find((x) => x.name === e.team);
    const a = t?.agents.find((x) => x.name === e.agent);
    const sign = pendingSign(e, from, !!a?.cells);
    if (!sign) continue;
    if (!a?.cells) { notInSheet.add(`${e.agent} (${e.team})`); continue; }
    const w = month.weeks.find((x) => x.n === weekOf(e, month.title))?.cells;
    const rev = e.revenue || 0;
    if (isUpsell(e)) bump(w?.upsell, sign * rev);
    else {
      bump(a.cells.signups, sign); bumpSplit(a.cells.split, e.type, sign);
      bump(t.totalCells?.signups, sign); bumpSplit(t.totalCells?.split, e.type, sign);
      bump(month.floor.cells?.achieved, sign);
      if (w) { bump(w.achieved, sign); bumpSplit(w.split, e.type, sign); bump(w.remaining, -sign); bump(w.mrr, sign * rev); }
    }
    patches[e.id] = sign > 0 ? { appliedAt: new Date().toISOString() } : null; // a removed entry is forgotten once it's off the sheet
  }
  // Put back sign-ups that were logged here and written in, but are no longer in the sheet.
  if (restore) for (const t of sheet.teams) for (const a of t.agents) {
    if (!a.cells) continue;
    const written = entries.filter((e) => !e.removed && !isUpsell(e) && e.team === t.name && e.agent === a.name && inSheet(e, from) && !e.acceptedAt).length;
    const short = written - (a.signups || 0);
    if (short > 0) { bump(a.cells.signups, short); bump(t.totalCells?.signups, short); bump(month.floor.cells?.achieved, short); }
  }
  for (const t of sheet.teams) for (const a of t.agents)
    if (a.cells && a.targetSet && a.target != null && num(at(grid, a.cells.target)) !== a.target) set[a.cells.target] = a.target; // only when it changed

  const values = { ...set };
  for (const [ref, d] of Object.entries(add)) values[ref] = Math.round(((num(at(grid, ref)) ?? 0) + d) * 100) / 100;
  for (const [ref, d] of Object.entries(split)) {
    const s = splitAS(at(grid, ref)) || { accounts: 0, sales: 0 };
    const accounts = s.accounts + d.accounts, sales = s.sales + d.sales;
    values[ref] = accounts || sales ? `${accounts}/${sales}` : 0;
  }
  return { values, patches, notInSheet: [...notInSheet] };
}

// Adds every waiting entry to the sheet. If someone saves the file meanwhile it starts again from their version, and
// it repeats while new entries come in. Never throws: the result is kept for Settings ("Sheet sync").
export async function syncMonth(title, by = null, opts = {}) {
  const log = { at: new Date().toISOString(), month: title, by };
  await setState(title, { tried: log.at });
  const LOCK = "st:lock:sheet";
  if (!(await tryLock(LOCK, 120000))) return { ...log, ok: true, busy: true }; // the sync that's running picks this up
  try {
    if (!isLogMonth(title)) throw new Error(`${title} isn't a logged month.`);
    const conn = await driveConnection();
    if (!conn?.refreshToken) throw new Error("Google Drive isn't connected.");
    if (!conn.canWrite) throw new Error("Google Drive is connected for reading only. Reconnect Google Drive in Settings to let the app write to the sheet.");
    const from = await deltaFrom();
    let cells = 0, notInSheet = [];
    for (let round = 0; round < 5; round++) {
      const startedAt = new Date().toISOString();
      const entries = await listEntries(title), roster = await getRoster(title);
      const file = await downloadFile();
      const grid = readWorkbook(file.bytes)[title];
      if (!grid) throw new Error(`The sheet has no "${title}" tab.`);
      const ch = monthChanges(grid, parseMonth(title, grid), entries, roster, from, round === 0 ? opts : {});
      notInSheet = ch.notInSheet;
      const work = Object.keys(ch.patches).length > 0;
      // Nothing waiting: only targets (and a requested restore) need writing, and only on the first round.
      if (!work && (round > 0 || !Object.keys(ch.values).length)) { await setState(title, { written: startedAt }); break; }
      const out = writeCells(file.bytes, title, ch.values);
      if ((await fileModifiedTime()) !== file.modifiedTime) continue; // edited meanwhile: redo on top of it
      await uploadFile(out.bytes);
      await patchEntries(title, ch.patches); // added once: never again
      cells += out.written.length;
      await setState(title, { written: startedAt });
      if (!work) break;
    }
    Object.assign(log, { ok: true, cells, notInSheet });
  } catch (e) {
    Object.assign(log, { ok: false, error: e.message });
  } finally {
    await unlock(LOCK).catch(() => {});
  }
  await hSet(SETTINGS, "sheetSync", log).catch(() => {});
  return log;
}

// Settings → Compare: for each agent, the sheet's total against what's been logged on the dashboard.
//   waiting: logged here, not added to the sheet yet · leaving: removed here, still in the sheet
//   missing: added to the sheet before, but the sheet has fewer now · typed: typed straight into the sheet
export async function compareMonth(title) {
  if (!isLogMonth(title)) throw new Error(`${title} is read from the sheet, so there's nothing to compare.`);
  const [file, entries, roster, from] = await Promise.all([downloadFile(), listEntries(title), getRoster(title), deltaFrom()]);
  const grid = readWorkbook(file.bytes)[title];
  if (!grid) throw new Error(`The sheet has no "${title}" tab.`);
  const month = applyRoster(parseMonth(title, grid), { ...roster, removed: [] });
  const accepted = roster.accepted || {};
  const rows = [], notInSheet = [];
  for (const t of month.teams) for (const a of t.agents) {
    const mine = entries.filter((e) => !isUpsell(e) && e.team === t.name && e.agent === a.name);
    if (!a.cells) { const n = mine.filter((e) => !e.removed && !e.acceptedAt).length; if (n) notInSheet.push(`${a.name} (${t.name}): ${n}`); continue; }
    const sheet = a.signups || 0;
    const logged = mine.filter((e) => !e.removed).length;
    const waiting = mine.reduce((s, e) => s + Math.max(0, pendingSign(e, from)), 0);
    const leaving = mine.reduce((s, e) => s + Math.max(0, -pendingSign(e, from)), 0);
    const kept = mine.filter((e) => !e.removed && inSheet(e, from) && !e.acceptedAt).length; // logged here and in the sheet
    const missing = Math.max(0, kept + leaving - sheet - (accepted[`${t.name}|${a.name}`] || 0));
    if (!logged && !sheet && !waiting && !leaving) continue;
    rows.push({ team: t.name, agent: a.name, sheet, logged, typed: Math.max(0, sheet - kept - leaving), waiting, leaving, missing, off: !!(waiting || leaving || missing) });
  }
  const sum = (f) => rows.reduce((s, r) => s + r[f], 0);
  const waitingRevenue = entries.reduce((s, e) => s + (pendingSign(e, from) > 0 ? e.revenue || 0 : 0), 0);
  return {
    month: title, rows, notInSheet, sheetEdited: file.modifiedTime, at: new Date().toISOString(),
    totals: { sheet: sum("sheet"), logged: sum("logged"), typed: sum("typed"), waiting: sum("waiting"), leaving: sum("leaving"), missing: sum("missing"), waitingRevenue },
  };
}

// "Make the dashboard match the sheet": the sheet wins. Entries not in the sheet yet stop counting (acceptedAt), removed
// ones still in the sheet are forgotten (they stay counted there), and sign-ups missing from the sheet are accepted as
// they are. Nothing is written to the sheet.
export async function acceptSheet(title, by) {
  const cmp = await compareMonth(title);
  const [entries, from] = await Promise.all([listEntries(title), deltaFrom()]);
  const patches = {};
  for (const e of entries) {
    const sign = pendingSign(e, from);
    if (sign > 0) patches[e.id] = { acceptedAt: new Date().toISOString(), acceptedBy: by };
    else if (e.removed) patches[e.id] = null;
  }
  await patchEntries(title, patches);
  const roster = await getRoster(title);
  const accepted = { ...(roster.accepted || {}) };
  for (const r of cmp.rows) if (r.missing) accepted[`${r.team}|${r.agent}`] = (accepted[`${r.team}|${r.agent}`] || 0) + r.missing;
  await saveRoster(title, { ...roster, accepted });
  await setState(title, { written: new Date().toISOString() });
}
