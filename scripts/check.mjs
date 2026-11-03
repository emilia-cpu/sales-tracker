// Prints what the parser reads from data/snapshot.json, to compare against the sheet.
import fs from "node:fs";
import { parseMonth } from "../lib/parse.js";
const snap = JSON.parse(fs.readFileSync(new URL("../data/snapshot.json", import.meta.url)));
for (const [title, grid] of Object.entries(snap)) {
  const m = parseMonth(title, grid);
  console.log(`\n== ${title}  floor ${m.floor.achieved}/${m.floor.target}  agents total ${m.totals.signups} (acc ${m.totals.accounts} / sales ${m.totals.sales}) target ${m.totals.target}`);
  console.log("  weeks:", m.weeks.map((w) => `W${w.n} ${w.achieved}/${w.target} [${w.accounts}/${w.sales}] mrr ${w.mrr} up ${w.upsell}`).join(" | "));
  for (const t of m.teams) console.log(`  ${t.name} (${t.leader}): ${t.signups}/${t.target} [${t.accounts}/${t.sales}]  ` + t.agents.map((a) => `${a.name}:${a.signups}/${a.target ?? "-"}`).join(", "));
}
