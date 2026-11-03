// Minimal .xlsx reader: unzips only the workbook, shared strings and the month tabs (the file is mostly images),
// and returns each tab as a grid of cell texts, the same shape lib/parse.js reads.
// Cells hold the values the sheet last calculated; formulas aren't re-run.
import { unzipSync, strFromU8 } from "fflate";
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

// { "November 2026": grid, … } for every month tab in the sign-up layout.
export function readWorkbook(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const base = unzipSync(bytes, { filter: (f) => ["xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/sharedStrings.xml"].includes(f.name) });
  const wb = strFromU8(base["xl/workbook.xml"]);
  const rels = Object.fromEntries([...strFromU8(base["xl/_rels/workbook.xml.rels"]).matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => [m[1].match(/\bId="([^"]+)"/)?.[1], m[1].match(/\bTarget="([^"]+)"/)?.[1]]));
  const strings = base["xl/sharedStrings.xml"] ? [...strFromU8(base["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];

  const tabs = [...wb.matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => {
    const name = decode(m[1].match(/\bname="([^"]*)"/)?.[1] || "");
    const target = rels[m[1].match(/\br:id="([^"]+)"/)?.[1]] || "";
    return { name, path: target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "") };
  }).filter((t) => monthKey(t.name));

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
