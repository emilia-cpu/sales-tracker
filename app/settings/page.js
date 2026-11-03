import { redirect } from "next/navigation";
import { currentUser, isAdmin, googleConfigured } from "@/lib/auth";
import { driveConnection, readDriveTabs, FILE_ID } from "@/lib/drive";
import { ptISO } from "@/lib/time";
import Header from "@/components/Header";

export const dynamic = "force-dynamic";

const when = (iso) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

// Admin only: connect the "Lahore Sales Target.xlsx" file in Google Drive so the dashboard reads it live.
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
    sp.drive === "failed" ? { ok: false, t: `Connecting didn't finish${sp.reason ? `: ${sp.reason}` : "."}` } : null;

  return (
    <div className="wrap">
      <Header me={{ ...user, admin: true }} today={ptISO()} active="settings" />
      {notice && <div className={`notice ${notice.ok ? "ok" : ""}`} role="status">{notice.t}</div>}
      <section className="card">
        <div className="card-h">
          <h2>Sales file</h2>
          <span className={`badge ${conn && !error ? "g" : conn ? "r" : "n"}`}>{conn ? (error ? "Problem" : "Live") : "Not connected"}</span>
        </div>
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
          </dl>
          {error && <div className="notice" role="alert">{error}</div>}
          <div className="setacts">
            {googleConfigured() ? <a className="b pri" href="/api/drive/connect">{conn ? "Reconnect Google Drive" : "Connect Google Drive"}</a> : <span className="note">Add the Google sign-in keys to the app first.</span>}
            {conn && <form action="/api/drive/disconnect" method="post"><button className="b no">Disconnect</button></form>}
          </div>
          <p className="note">Google will ask to let Sales Target see your Drive files. It only ever opens this one file, and it never changes anything.</p>
        </div>
      </section>
    </div>
  );
}
