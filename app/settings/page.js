import { redirect } from "next/navigation";
import { currentUser, isAdmin, googleConfigured } from "@/lib/auth";
import { driveConnection, readDriveTabs, FILE_ID } from "@/lib/drive";
import { ptISO, ptMonthTitle } from "@/lib/time";
import { loadMonth } from "@/lib/source";
import { parseMonth } from "@/lib/parse";
import { getRoster, applyRoster } from "@/lib/roster";
import RosterEditor from "@/components/RosterEditor";
import SheetCompare from "@/components/SheetCompare";
import { isLogMonth } from "@/lib/entries";
import TeamAccess from "@/components/TeamAccess";
import { listPeople, fixedAdmins } from "@/lib/people";
import { lastSync } from "@/lib/sheetsync";
import Header from "@/components/Header";

export const dynamic = "force-dynamic";

const when = (iso) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

// Admin only: connect the "Lahore Sales Target.xlsx" file in Google Drive so the dashboard reads it live,
// change each month's teams (add, remove and restore agents), and decide who can sign in (Team access).
export default async function Settings({ searchParams }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/");
  const sp = await searchParams;
  const conn = await driveConnection().catch(() => null);
  let file = null, error = null;
  if (conn) {
    try { file = await readDriveTabs(); error = file.error; }
    catch (e) { error = e.message; }
  }
  const notice =
    sp.drive === "connected" ? { ok: true, t: "Google Drive is connected. The dashboard now reads the sales file live." } :
    sp.drive === "disconnected" ? { ok: true, t: "Google Drive is disconnected. The dashboard shows the saved copy from Nov 3." } :
    sp.drive === "failed" ? { ok: false, t: `Connecting didn't finish${sp.reason ? `: ${sp.reason}` : "."}` } :
    sp.synced === "1" ? { ok: true, t: "This month's numbers were written into the sheet." } :
    sp.synced === "0" ? { ok: false, t: "Writing to the sheet didn't work. See Sheet sync below." } : null;
  const sync = await lastSync();
  const readOnly = conn && !conn.canWrite;

  // Teams & agents: this month by default, or the month picked there (?rm=).
  const { tabs, months } = await loadMonth(null, ptMonthTitle());
  const rm = months.includes(sp.rm) ? sp.rm : months.includes(ptMonthTitle()) ? ptMonthTitle() : months[0];
  let roster = null;
  if (rm) {
    const r = await getRoster(rm);
    const view = applyRoster(parseMonth(rm, tabs[rm]), r);
    roster = {
      teams: view.teams.map((t) => ({ name: t.name, leader: t.leader, agents: t.agents.map((a) => ({ name: a.name, target: a.target, added: !!a.added, targetSet: !!a.targetSet, sheetTarget: a.sheetTarget ?? null })) })),
      removed: r.removed,
      revenueTarget: r.revenueTarget,
      signupTarget: view.floor.target,
    };
  }

  return (
    <div className="wrap">
      <Header me={{ ...user, admin: true }} today={ptISO()} active="settings" />
      {notice && <div className={`notice ${notice.ok ? "ok" : ""}`} role="status">{notice.t}</div>}
      {roster
        ? <RosterEditor months={months} month={rm} teams={roster.teams} removed={roster.removed} revenueTarget={roster.revenueTarget} signupTarget={roster.signupTarget} />
        : <section className="card"><div className="card-h"><h2>Teams &amp; agents</h2></div><div className="setbody"><p className="muted">Connect Google Drive first. The teams for each month come from the sheet's month tabs.</p></div></section>}
      <TeamAccess me={user.email} people={await listPeople()} fixed={fixedAdmins()} />
      {/* At the bottom and folded away once it's working; opens by itself when it isn't connected or has a problem. */}
      <details className="card fold" open={!conn || !!error || !!sp.drive || !!sp.synced || readOnly || sync?.ok === false}>
        <summary className="card-h">
          <h2>Sales file</h2>
          <span className={`badge ${conn && !error ? "g" : conn ? "r" : "n"}`}>{conn ? (error ? "Problem" : "Live") : "Not connected"}</span>
          {conn && <span className={`badge ${readOnly || sync?.ok === false ? "r" : "g"}`}>{readOnly ? "Read only" : sync?.ok === false ? "Sync problem" : "Writes to sheet"}</span>}
          <span className="sp" />
          <span className="note fold-hint">Details</span>
        </summary>
        <div className="setbody">
          <p className="muted">
            The dashboard reads <b>{file?.name || "Lahore Sales Target.xlsx"}</b> straight from Google Drive and picks up edits within about 30 seconds.
            Keep editing the file as you do now. New month tabs show up in the month picker automatically when they use the same layout.
          </p>
          <dl className="facts">
            <div><dt>File</dt><dd><a href={`https://docs.google.com/spreadsheets/d/${FILE_ID}/edit`} target="_blank" rel="noreferrer">Open in Google Drive</a></dd></div>
            {conn && <div><dt>Connected by</dt><dd>{conn.by} · {when(conn.at)}</dd></div>}
            {file && <div><dt>Last edited</dt><dd>{when(file.updated)}</dd></div>}
            {file && <div><dt>Months found</dt><dd>{Object.keys(file.tabs).join(", ")}</dd></div>}
            {conn && <div><dt>Sheet sync</dt><dd>{sync ? (sync.ok ? `Wrote ${sync.month} at ${when(sync.at)} (${sync.cells} cells)` : `Failed at ${when(sync.at)}: ${sync.error}`) : "Nothing written yet"}</dd></div>}
            {sync?.ok && sync.notInSheet?.length > 0 && <div><dt>Not in the sheet</dt><dd>{sync.notInSheet.join(", ")}. Add them to the month tab to have their sign-ups written in.</dd></div>}
          </dl>
          {readOnly && <div className="notice" role="alert">Google Drive is connected for reading only. Click <b>Reconnect Google Drive</b> and allow access so logged sign-ups are written into the sheet.</div>}
          {error && <div className="notice" role="alert">{error}</div>}
          <div className="setacts">
            {googleConfigured() ? <a className="b pri" href="/api/drive/connect">{conn ? "Reconnect Google Drive" : "Connect Google Drive"}</a> : <span className="note">Add the Google sign-in keys to the app first.</span>}
            {conn && !readOnly && <form action="/api/sheet/sync" method="post"><button className="b">Write to sheet now</button></form>}
            {conn && <form action="/api/drive/disconnect" method="post"><button className="b no">Disconnect</button></form>}
          </div>
          <p className="note">Google will ask to let Sales Target see and edit your Drive files. It only ever opens this one file, and only writes this month's sign-ups, accounts/sales, revenue and changed targets into the cells for them, never formulas. Every change is kept in the file's Version history.</p>
        </div>
      </details>
      {/* Right under the sheet connection: check the sheet against the dashboard. */}
      {conn && months.some(isLogMonth) && <SheetCompare months={months.filter(isLogMonth)} current={ptMonthTitle()} canWrite={!readOnly} />}
    </div>
  );
}
