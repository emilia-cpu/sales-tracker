// Reads one month tab of "Lahore Sales Target" into numbers the dashboard can use.
// Blocks move around between months (4 or 5 teams per row, extra rows), so everything is found by its label,
// never by a fixed cell: "Whole Floor Target", "WEEK n", and each team's "Agents Name" header.
// A grid is an array of rows, each an array of cell texts as the sheet displays them.

const txt = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const cell = (g, r, c) => txt(g[r]?.[c]);

export function num(v) {
  const s = txt(v).replace(/[$,%\s]/g, "");
  if (!s || !/^-?\d*\.?\d+$/.test(s)) return null;
  return Number(s);
}

// "Accounts/Sales" cells hold "4/3". Excel turned some into dates (4/3 → Apr 3), which the export shows as "4/3"
// again; Google Sheets may show "4/3/2026". The first number is accounts, the second sales. A plain 0 means none.
export function splitAS(v) {
  let s = txt(v);
  // Straight from the .xlsx file such a date is a day count (46143 = 2026-05-01 → "5/1").
  const serial = num(s);
  if (serial > 20000 && serial < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 864e5);
    s = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  }
  const m = s.match(/^(\d+)\s*\/\s*(\d+)(?:\s*\/\s*\d{2,4})?$/);
  if (m) return { accounts: +m[1], sales: +m[2] };
  if (num(s) === 0) return { accounts: 0, sales: 0 };
  return null;
}

// Column of the first cell in row r, columns from..to, whose text matches re.
function findCol(g, r, from, to, re) {
  for (let c = from; c <= to; c++) if (re.test(cell(g, r, c))) return c;
  return -1;
}

// Value in row r to the right of column c (first non-empty cell within a few columns).
function rightOf(g, r, c, span = 3) {
  for (let k = c + 1; k <= c + span; k++) {
    const t = cell(g, r, k);
    if (t) return num(t);
  }
  return null;
}

function floor(g) {
  for (let r = 0; r < g.length; r++) {
    const c = findCol(g, r, 0, (g[r] || []).length, /^whole floor target$/i);
    if (c < 0) continue;
    for (let h = r + 1; h < r + 5; h++) {
      const ac = findCol(g, h, 0, (g[h] || []).length, /^achieved$/i);
      if (ac < 0) continue;
      const tc = findCol(g, h, 0, ac, /^total/i);
      return { target: num(cell(g, h + 1, tc)) ?? 0, achieved: num(cell(g, h + 1, ac)) ?? 0 };
    }
  }
  return { target: 0, achieved: 0 };
}

function weeks(g) {
  const out = [];
  for (let r = 0; r < g.length; r++) {
    (g[r] || []).forEach((v, c) => {
      const m = txt(v).match(/^week\s*(\d)$/i);
      if (!m) return;
      // Header row ("Total | Accounts/Sales | Achieved | Remaining") sits a row or two below the label.
      let h = -1;
      for (let k = r + 1; k < r + 4; k++) if (/^total$/i.test(cell(g, k, c))) { h = k; break; }
      if (h < 0) return;
      const end = c + 10;
      const asC = findCol(g, h, c + 1, end, /accounts|sales/i);
      const acC = findCol(g, h, c + 1, end, /^achieved$/i);
      const target = num(cell(g, h + 1, c)) ?? 0;
      const achieved = acC >= 0 ? num(cell(g, h + 1, acC)) ?? 0 : 0;
      const split = asC >= 0 ? splitAS(cell(g, h + 1, asC)) : null;
      // Revenue row: "MRR Revenue <amount> … Upsell Revenue <amount>".
      let mrr = null, upsell = null;
      for (let k = h + 2; k < h + 4; k++) {
        const mc = findCol(g, k, c, end, /^mrr revenue$/i);
        const uc = findCol(g, k, c, end, /^upsell revenue$/i);
        if (mc >= 0) mrr = rightOf(g, k, mc, uc > mc ? uc - mc - 1 : 3);
        if (uc >= 0) upsell = rightOf(g, k, uc);
        if (mc >= 0 || uc >= 0) break;
      }
      out.push({ n: +m[1], target, achieved, accounts: split?.accounts ?? null, sales: split?.sales ?? null, mrr, upsell });
    });
  }
  return out.sort((a, b) => a.n - b.n).filter((w, i, a) => i === 0 || a[i - 1].n !== w.n);
}

// "Katherine's Team" → leader "Katherine"; "Ryan & DJ's Team" → "Ryan & DJ".
const leaderOf = (name) => name.replace(/['’]s?\s*team$/i, "").replace(/\s*team$/i, "").trim();

function teams(g) {
  const out = [];
  for (let r = 0; r < g.length; r++) {
    (g[r] || []).forEach((v, c) => {
      if (!/^agents name$/i.test(txt(v))) return;
      let name = "";
      for (let k = r - 1; k >= r - 3 && !name; k--) if (/team/i.test(cell(g, k, c))) name = cell(g, k, c);
      name = name || `Team ${out.length + 1}`;
      const agents = [];
      let blanks = 0;
      for (let k = r + 1; k < g.length && blanks < 6; k++) {
        const a = cell(g, k, c);
        if (/^total$/i.test(a) || /^agents name$/i.test(a) || /team/i.test(a)) break;
        if (!a) { blanks++; continue; }
        blanks = 0;
        const split = splitAS(cell(g, k, c + 3));
        agents.push({
          name: a,
          target: num(cell(g, k, c + 1)),
          signups: num(cell(g, k, c + 2)) ?? 0,
          accounts: split?.accounts ?? null,
          sales: split?.sales ?? null,
        });
      }
      const sum = (f) => agents.reduce((s, x) => s + (x[f] || 0), 0);
      out.push({ name, leader: leaderOf(name), agents, target: sum("target"), signups: sum("signups"), accounts: sum("accounts"), sales: sum("sales") });
    });
  }
  return out;
}

// Team totals are added up from the agent rows: the sheet's own Total rows are sometimes left over from the
// month the tab was copied from.
export function parseMonth(title, grid) {
  const t = teams(grid);
  const sum = (f) => t.reduce((s, x) => s + x[f], 0);
  return {
    title,
    floor: floor(grid),
    weeks: weeks(grid),
    teams: t,
    totals: { target: sum("target"), signups: sum("signups"), accounts: sum("accounts"), sales: sum("sales") },
  };
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

// "October 2026" → 202610, or null for tabs that aren't months.
export function monthKey(title) {
  const m = txt(title).toLowerCase().match(/^([a-z]+)\s+(\d{4})$/);
  const i = m ? MONTHS.indexOf(m[1]) : -1;
  return i < 0 ? null : +m[2] * 100 + i + 1;
}
