import { NextResponse } from "next/server";
import { currentUser, isAdmin } from "@/lib/auth";
import { loadMonth } from "@/lib/source";
import { parseMonth } from "@/lib/parse";
import { getRoster, saveRoster, same } from "@/lib/roster";

// Admin: change one month's teams. { month, action: "add" | "remove" | "restore" | "target", team, agent, target? }
// "add" puts a new agent in a team, "remove" takes any agent out of a team, "restore" brings a removed sheet agent back,
// "target" sets an agent's target (empty puts a sheet agent back on the sheet's target).
export async function POST(req) {
  const user = await currentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Only admins can change teams." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const agent = String(b.agent || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!agent) return NextResponse.json({ error: "Enter the agent's name." }, { status: 400 });
  const { tabs } = await loadMonth(b.month, b.month);
  if (!tabs[b.month]) return NextResponse.json({ error: "Pick a month from the list." }, { status: 400 });
  const sheet = parseMonth(b.month, tabs[b.month]);
  const team = sheet.teams.find((t) => t.name === b.team);
  if (!team) return NextResponse.json({ error: "Pick a team from the list." }, { status: 400 });
  const inSheet = team.agents.find((a) => same(a.name, agent));
  const r = await getRoster(b.month);
  const stamp = { by: user.email, at: new Date().toISOString() };
  const isAdded = r.added.some((x) => same(x.team, team.name) && same(x.agent, agent));
  const isRemoved = r.removed.some((x) => same(x.team, team.name) && same(x.agent, agent));

  const t = b.target === "" || b.target == null ? null : Number(b.target);
  if (t != null && !(Number.isInteger(t) && t >= 0 && t <= 1000)) return NextResponse.json({ error: "Target must be a whole number." }, { status: 400 });

  if (b.action === "add") {
    if ((inSheet && !isRemoved) || isAdded) return NextResponse.json({ error: `${agent} is already in ${team.name}.` }, { status: 400 });
    if (inSheet) r.removed = r.removed.filter((x) => !(same(x.team, team.name) && same(x.agent, agent))); // re-adding a removed sheet agent
    else r.added.push({ team: team.name, agent, target: t, ...stamp });
  } else if (b.action === "remove") {
    if (isAdded) r.added = r.added.filter((x) => !(same(x.team, team.name) && same(x.agent, agent)));
    else if (inSheet && !isRemoved) r.removed.push({ team: team.name, agent: inSheet.name, ...stamp });
    else return NextResponse.json({ error: `${agent} isn't in ${team.name}.` }, { status: 400 });
  } else if (b.action === "target") {
    const mine = (x) => same(x.team, team.name) && same(x.agent, agent);
    if (isAdded) r.added = r.added.map((x) => (mine(x) ? { ...x, target: t } : x));
    else if (inSheet && !isRemoved) {
      r.targets = r.targets.filter((x) => !mine(x));
      if (t != null && t !== inSheet.target) r.targets.push({ team: team.name, agent: inSheet.name, target: t, ...stamp });
    } else return NextResponse.json({ error: `${agent} isn't in ${team.name}.` }, { status: 400 });
  } else if (b.action === "restore") {
    if (!isRemoved) return NextResponse.json({ error: `${agent} wasn't removed.` }, { status: 400 });
    r.removed = r.removed.filter((x) => !(same(x.team, team.name) && same(x.agent, agent)));
  } else {
    return NextResponse.json({ error: "Unknown change." }, { status: 400 });
  }
  await saveRoster(b.month, r);
  return NextResponse.json({ ok: true });
}
