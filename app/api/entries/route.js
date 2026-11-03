import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { loadMonth } from "@/lib/source";
import { addEntry, isLogMonth } from "@/lib/entries";
import { ptMonthTitle } from "@/lib/time";

// Log one sign-up for this month: { type: "sale" | "account", team, agent, client }.
// Anyone signed in may log; the team and agent must be in this month's tab of the sheet.
export async function POST(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const type = b.type === "sale" ? "sale" : b.type === "account" ? "account" : null;
  const client = String(b.client || "").trim().slice(0, 120);
  if (!type) return NextResponse.json({ error: "Choose Sale or Account." }, { status: 400 });
  if (!client) return NextResponse.json({ error: "Enter the client name." }, { status: 400 });
  const title = ptMonthTitle();
  if (!isLogMonth(title)) return NextResponse.json({ error: "Logging starts in November 2026." }, { status: 400 });
  const { month } = await loadMonth(title, title);
  if (!month || month.title !== title) return NextResponse.json({ error: `The sheet has no "${title}" tab yet.` }, { status: 400 });
  const team = month.teams.find((t) => t.name === b.team);
  const agent = team?.agents.find((a) => a.name === b.agent);
  if (!team || !agent) return NextResponse.json({ error: "Pick a team and an agent from the list." }, { status: 400 });
  const entry = await addEntry(title, { type, team: team.name, agent: agent.name, client, by: user.email });
  return NextResponse.json({ entry });
}
