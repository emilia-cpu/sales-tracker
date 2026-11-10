// Minimal .xlsx reader: unzips only the workbook, shared strings and the month tabs (the file is mostly images),
// and returns each tab as a grid of cell texts, the same shape lib/parse.js reads.
// Cells hold the values the sheet last calculated; formulas aren't re-run.
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { monthKey } from "./parse.js";

const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)) : { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[e.toLowerCase()]);

// Text of an <si> / <is> element: plain <t>, or rich-text runs <r><t>…</t></r>. Phonetic hints (<rPh>) are skipped.
const textOf = (xml) => decode([...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));

const colIndex = (ref) => {
  let n = 0;
  for (const ch of ref.match(/^[A-Z]+/)[0]) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

// Numbers as the export shows them: whole numbers without ".0", others rounded to 4 places.
const showNum = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1e4) / 1e4);
};

function sheetGrid(xml, strings) {
  const grid = [];
  for (const row of xml.matchAll(/<row\b[^>]*?\br="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells = [];
    for (const c of (row[2] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = c[1].match(/\br="([A-Z]+)\d+"/)?.[1];
      if (!ref) continue;
      const type = c[1].match(/\bt="(\w+)"/)?.[1] || "n";
      const body = c[2] || "";
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let out = "";
      if (type === "s") out = strings[+v] ?? "";
      else if (type === "inlineStr") out = textOf(body);
      else if (type === "str") out = decode(v ?? "");
      else if (type === "b") out = v === "1" ? "TRUE" : "FALSE";
      else if (type === "e") out = "";
      else if (v != null && v !== "") out = showNum(v);
      cells[colIndex(ref)] = out;
    }
    grid[+row[1] - 1] = Array.from(cells, (x) => x ?? "");
  }
  return Array.from(grid, (r) => r || []);
}

// Month tabs listed in the workbook: [{ name, path }] (path of the tab's XML inside the zip).
function monthTabs(wbXml, relsXml) {
  const rels = Object.fromEntries([...relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => [m[1].match(/\bId="([^"]+)"/)?.[1], m[1].match(/\bTarget="([^"]+)"/)?.[1]]));
  return [...wbXml.matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => {
    const name = decode(m[1].match(/\bname="([^"]*)"/)?.[1] || "");
    const target = rels[m[1].match(/\br:id="([^"]+)"/)?.[1]] || "";
    return { name, path: target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "") };
  }).filter((t) => monthKey(t.name));
}

// { "November 2026": grid, … } for every month tab in the sign-up layout.
export function readWorkbook(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const base = unzipSync(bytes, { filter: (f) => ["xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/sharedStrings.xml"].includes(f.name) });
  const strings = base["xl/sharedStrings.xml"] ? [...strFromU8(base["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];

  const tabs = monthTabs(strFromU8(base["xl/workbook.xml"]), strFromU8(base["xl/_rels/workbook.xml.rels"]));

  const wanted = new Set(tabs.map((t) => t.path));
  const files = unzipSync(bytes, { filter: (f) => wanted.has(f.name) });
  const out = {};
  for (const t of tabs) {
    if (!files[t.path]) continue;
    const grid = sheetGrid(strFromU8(files[t.path]), strings);
    const flat = grid.map((r) => r.join(" ")).join(" ");
    if (flat.includes("Sign-Ups") && flat.includes("Agents Name")) out[t.name] = grid;
  }
  return out;
}

// ---------- writing (lib/sheetsync.js) ----------

const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const colOf = (r) => r.match(/^[A-Z]+/)[0];
const rowOf = (r) => +r.match(/\d+$/)[0];

// The cell element for a value: a number, or text stored inline (so the shared strings stay untouched).
function cellXml(ref, attrs, value) {
  const keep = attrs.replace(/\s+t="[^"]*"/, "");
  return typeof value === "number"
    ? `<c r="${ref}"${keep}><v>${value}</v></c>`
    : `<c r="${ref}"${keep} t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
}

// Does a cell's inner XML hold a formula that uses other cells (=G49+Q49, SUM(D70:D78), a shared formula)?
// Number-only formulas someone typed, like =5+7+3+3 or =4, don't count: they're just numbers.
function usesCells(inner) {
  const f = (inner || "").match(/<f\b([^>]*?)(\/>|>([\s\S]*?)<\/f>)/);
  if (!f) return false;
  if (f[2] === "/>" || /\bt="shared"/.test(f[1])) return true;
  return /!|\$?\b[A-Z]{1,3}\$?\d+\b/.test(decode(f[3] || ""));
}

// Sets one cell in a worksheet's XML. Formulas that use other cells are never changed (number-only ones are).
// Returns [xml, "written" | "formula" | "no row"].
function setCell(xml, ref, value) {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`);
  const m = xml.match(re);
  if (m) {
    if (usesCells(m[2])) return [xml, "formula"];
    return [xml.replace(re, cellXml(ref, m[1].replace(/\/$/, ""), value)), "written"];
  }
  // No cell yet: put it into its row, in column order.
  const rowRe = new RegExp(`<row r="${rowOf(ref)}"([^>]*?)(/>|>([\\s\\S]*?)</row>)`);
  const row = xml.match(rowRe);
  if (!row) return [xml, "no row"];
  const cell = cellXml(ref, "", value);
  const inner = row[3] || "";
  const key = (c) => colIndex(c);
  let at = inner.length;
  for (const c of inner.matchAll(/<c r="([A-Z]+)\d+"/g)) if (key(c[1]) > key(colOf(ref))) { at = c.index; break; }
  const attrs = row[1].replace(/\/$/, "");
  return [xml.replace(rowRe, `<row r="${rowOf(ref)}"${attrs}>${inner.slice(0, at)}${cell}${inner.slice(at)}</row>`), "written"];
}

// Cells in one month tab whose formula uses other cells (left to the sheet to calculate): a Set of "J18"-style refs.
export function formulaCells(buf, tab) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const base = unzipSync(bytes, { filter: (f) => ["xl/workbook.xml", "xl/_rels/workbook.xml.rels"].includes(f.name) });
  const t = monthTabs(strFromU8(base["xl/workbook.xml"]), strFromU8(base["xl/_rels/workbook.xml.rels"])).find((x) => x.name === tab);
  if (!t) return new Set();
  const xml = strFromU8(unzipSync(bytes, { filter: (f) => f.name === t.path })[t.path]);
  const out = new Set();
  for (const c of xml.matchAll(/<c r="([A-Z]+\d+)"[^>]*?(?<!\/)>([\s\S]*?)<\/c>/g)) if (usesCells(c[2])) out.add(c[1]); // skips empty <c …/> cells
  return out;
}

// A copy of the workbook with cells in one month tab set: values = { "D70": 3, "E70": "2/1", … }.
// Only that tab changes. Google Sheets recalculates the formulas (totals, remaining) when the file is opened.
export function writeCells(buf, tab, values) {
  const files = unzipSync(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
  const t = monthTabs(strFromU8(files["xl/workbook.xml"]), strFromU8(files["xl/_rels/workbook.xml.rels"])).find((x) => x.name === tab);
  if (!t || !files[t.path]) throw new Error(`The "${tab}" tab wasn't found in the file.`);
  let xml = strFromU8(files[t.path]);
  const result = { written: [], formula: [], missing: [] };
  for (const [ref, value] of Object.entries(values)) {
    let how;
    [xml, how] = setCell(xml, ref, value);
    (how === "written" ? result.written : how === "formula" ? result.formula : result.missing).push(ref);
  }
  files[t.path] = strToU8(xml);
  // Images are already compressed; store them as they are.
  const out = zipSync(Object.fromEntries(Object.entries(files).map(([name, data]) => [name, [data, { level: /\.(png|jpe?g|gif|emf|wmf)$/i.test(name) ? 0 : 6 }]])));
  return { bytes: out, ...result };
}
