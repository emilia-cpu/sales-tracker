import { redirect } from "next/navigation";
import { after } from "next/server";
import { needsSync, syncMonth } from "@/lib/sheetsync";
import { currentUser, isAdmin } from "@/lib/auth";
import { loadMonth, rosteredMonth } from "@/lib/source";
import { ptISO, ptMonthTitle } from "@/lib/time";
import { isLogMonth } from "@/lib/entries";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { m } = await searchParams;
  const { tabs, ...data } = await loadMonth(m, ptMonthTitle());
  // Logging is for this month only, once its tab exists (the form lists its teams and agents).
  const now = ptMonthTitle();
  // If an earlier write to the sheet failed, catch up now (in the background, after the page is sent).
  if (isLogMonth(now) && (await needsSync(now))) after(() => syncMonth(now));
  const roster = isLogMonth(now) && tabs[now] ? (await rosteredMonth(tabs, now)).teams.map((t) => ({ name: t.name, agents: t.agents.map((a) => a.name) })) : null;
  return <Dashboard me={{ ...user, admin: isAdmin(user) }} today={ptISO()} current={now} roster={roster} {...data} />;
}
