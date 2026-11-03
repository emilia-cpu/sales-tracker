import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { loadMonth, rosteredMonth } from "@/lib/source";
import { addEntry, isLogMonth } from "@/lib/entries";
import { ptMonthTitle } from "@/lib/time";

// Log one sign-up for this month: { type: "sale" | "account", team, agent, client, revenue } (revenue in dollars). All required.
// Anyone signed in may log; the team and agent must be on this month's roster (the sheet plus the admin's changes).
export async function POST(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const type = b.type === "sale" ? "sale" : b.type === "account" ? "account" : null;
  const client = String(b.client || "").trim().slice(0, 120);
  if (!type) return NextResponse.json({ error: "Choose Sale or Account." }, { status: 400 });
  if (!client) return NextResponse.json({ error: "Enter the client name." }, { status: 400 });
  const raw = String(b.revenue ?? "").replace(/[$,\s]/g, "");
  if (raw === "") return NextResponse.json({ error: "Enter the revenue." }, { status: 400 });
  const revenue = Math.round(Number(raw) * 100) / 100;
  if (!(Number.isFinite(revenue) && revenue >= 0 && revenue <= 1e6)) return NextResponse.json({ error: "Revenue must be a dollar amount, like 350 or 1250.50." }, { status: 400 });
  const title = ptMonthTitle();
  if (!isLogMonth(title)) return NextResponse.json({ error: "Logging starts in November 2026." }, { status: 400 });
  const { tabs } = await loadMonth(title, title);
  if (!tabs[title]) return NextResponse.json({ error: `The sheet has no "${title}" tab yet.` }, { status: 400 });
  const month = await rosteredMonth(tabs, title);
  const team = month.teams.find((t) => t.name === b.team);
  const agent = team?.agents.find((a) => a.name === b.agent);
  if (!team || !agent) return NextResponse.json({ error: "Pick a team and an agent from the list." }, { status: 400 });
  const entry = await addEntry(title, { type, team: team.name, agent: agent.name, client, revenue, by: user.email });
  return NextResponse.json({ entry });
}
