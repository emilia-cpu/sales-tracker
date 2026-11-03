// Where month tabs come from: the live Drive file once the admin has connected it (lib/drive.js), otherwise
// data/snapshot.json, exported from "Lahore Sales Target.xlsx" on 2026-11-03 (local only).
import { promises as fs } from "fs";
import path from "path";
import { parseMonth, monthKey } from "@/lib/parse";
import { driveConnection, readDriveTabs } from "@/lib/drive";
import { isLogMonth, listEntries, applyEntries } from "@/lib/entries";
import { getRoster, applyRoster } from "@/lib/roster";

// The saved copy stays on this computer only (it's not in the GitHub repo), so on Vercel it's empty until Drive is connected.
async function readSnapshot() {
  try { return JSON.parse(await fs.readFile(path.join(process.cwd(), "data", "snapshot.json"), "utf8")); } catch { return {}; }
}

async function readTabs() {
  const snap = { tabs: await readSnapshot(), updated: "2026-11-03T16:48:42Z", source: "snapshot" };
  if (!(await driveConnection().catch(() => null))) return snap;
  try {
    const live = await readDriveTabs();
    return { tabs: live.tabs, updated: live.updated, source: "live", error: live.error };
  } catch (e) {
    return { ...snap, error: e.message };
  }
}

// One month's tab with the admin's team changes applied (Settings → Teams & agents), before sign-ups are logged in.
export async function rosteredMonth(tabs, title) {
  return applyRoster(parseMonth(title, tabs[title]), await getRoster(title));
}

// Month tabs, newest first, plus the chosen month (default: this month if it has a tab, else the newest), with the
// admin's team changes and, from November 2026 on, the logged sign-ups.
export async function loadMonth(wanted, currentTitle) {
  const { tabs, updated, source, error = null } = await readTabs();
  const months = Object.keys(tabs).filter(monthKey).sort((a, b) => monthKey(b) - monthKey(a));
  const title = months.find((m) => m === wanted) || months.find((m) => m === currentTitle) || months[0];
  let month = title ? await rosteredMonth(tabs, title) : null;
  if (month && isLogMonth(title)) month = applyEntries(month, await listEntries(title));
  return { months, month, updated, source, error, tabs };
}
