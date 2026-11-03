// Reads the .xlsx with lib/xlsx.js and checks every month parses the same as data/snapshot.json (openpyxl export).
import fs from "node:fs";
import { readWorkbook } from "../lib/xlsx.js";
import { parseMonth } from "../lib/parse.js";
const t0 = Date.now();
const tabs = readWorkbook(fs.readFileSync(process.argv[2]));
console.log("read in", Date.now() - t0, "ms:", Object.keys(tabs).join(", "));
const snap = JSON.parse(fs.readFileSync(new URL("../data/snapshot.json", import.meta.url)));
for (const title of Object.keys(snap)) {
  const a = JSON.stringify(parseMonth(title, snap[title])), b = tabs[title] && JSON.stringify(parseMonth(title, tabs[title]));
  console.log(title, a === b ? "same" : "DIFFERENT");
  if (a !== b && b) { const A = JSON.parse(a), B = JSON.parse(b); console.log(" floor", A.floor, B.floor); console.log(" w", JSON.stringify(A.weeks), "\n  ", JSON.stringify(B.weeks)); }
}
