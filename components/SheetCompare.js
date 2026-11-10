"use client";
// Settings → Compare with sheet: reads the sales file fresh and, agent by agent, sets the sheet's sign-ups against what's
// been logged on the dashboard (and what was typed straight into the sheet). Either side can be made to match the other.
import { useState } from "react";
import { useRouter } from "next/navigation";

const when = (iso) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const usd = (n) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });

export default function SheetCompare({ months, current, canWrite }) {
  const router = useRouter();
  const [month, setMonth] = useState(months.includes(current) ? current : months[0]);
  const [busy, setBusy] = useState("");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [all, setAll] = useState(false);
  const [hist, setHist] = useState(null);

  // Earlier versions of the file: where agents' numbers went down (a typed number replaced by an older write).
  async function history() {
    setBusy("history"); setErr("");
    try {
      const r = await fetch(`/api/sheet/history?month=${encodeURIComponent(month)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't read the earlier versions.");
      setHist(j);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }

  async function run(fix) {
    setBusy(fix || "check"); setErr("");
    try {
      const r = await fetch(`/api/sheet/compare?month=${encodeURIComponent(month)}`, fix
        ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fix }) }
        : { method: "GET" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't read the sheet.");
      setRes({ ...j, fixed: fix });
      if (fix) router.refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }

  const t = res?.totals;
  const off = res ? res.rows.filter((r) => r.off) : [];
  const shown = res ? (all ? res.rows : off) : [];
  const issues = off.length + (res?.notInSheet?.length || 0);

  return (
    <section className="card" aria-labelledby="h-cmp">
      <div className="card-h">
        <h2 id="h-cmp">Compare with sheet</h2>
        {res && <span className={`badge ${off.length ? "r" : "g"}`}>{off.length ? `${off.length} to check` : "Matches"}</span>}
        <span className="sp" />
        {months.length > 1 && (
          <label className="sel month"><span className="sr">Month</span>
            <select value={month} onChange={(e) => { setMonth(e.target.value); setRes(null); }}>{months.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
        )}
      </div>
      <div className="setbody">
        <p className="muted">The team can type sign-ups into the sheet and log them here; both count. This reads <b>Lahore Sales Target.xlsx</b> fresh and checks {month}, agent by agent: what's in the sheet, what was logged here, and what was typed straight into the sheet.</p>
        <div className="setacts">
          <button className="b pri" disabled={!!busy} onClick={() => run(null)}>{busy === "check" ? "Comparing…" : res ? "Compare again" : "Compare now"}</button>
          <button className="b" disabled={!!busy} onClick={history}>{busy === "history" ? "Checking earlier versions… (up to a minute)" : "Check earlier versions"}</button>
          {res && <span className="note">Sheet last edited {when(res.sheetEdited)}</span>}
        </div>
        {err && <div className="notice" role="alert">{err}</div>}

        {hist && (
          <div className="hist">
            <b>Earlier versions{hist.from ? ` since ${when(hist.from)}` : ""}</b>
            <p className="note">Checked {hist.versions} saved version{hist.versions === 1 ? "" : "s"} of the file{hist.truncated ? " (the most recent ones)" : ""}, from just before the app first wrote to it until it switched to adding.</p>
            {!hist.drops.length
              ? <div className="notice ok" role="status">No agent's sign-ups or accounts/sales went down between versions, so no typed numbers were replaced.</div>
              : (
                <>
                  <div className="notice" role="status">{hist.drops.length} place{hist.drops.length === 1 ? "" : "s"} where a number went down. Open <b>File → Version history</b> in the sheet to look at the version before each one, and type back anything that was lost; it then counts on the dashboard too.</div>
                  <div className="cmp">
                    <div className="cmp-h hist5" aria-hidden="true"><span>Agent</span><span>Before</span><span>After</span><span>Saved</span><span>By</span></div>
                    {hist.drops.map((d, i) => (
                      <div className="cmp-r hist5 off" key={i}>
                        <span><b>{d.agent}</b><small className="tm">{d.team}</small></span>
                        <span className="num"><small>Before</small>{d.before}</span>
                        <span className="num"><small>After</small>{d.after}</span>
                        <span><small>Saved</small>{when(d.at)}</span>
                        <span className="note"><small>By</small>{d.by || "—"}</span>
                      </div>
                    ))}
                  </div>
                  <p className="note">Numbers are sign-ups (accounts/sales). A drop in a version saved while someone was editing may be their own correction.</p>
                </>
              )}
          </div>
        )}

        {res && (
          <div className="cmpsum">
            <div><span>In the sheet</span><b className="num">{t.sheet}</b></div>
            <div><span>Logged here</span><b className="num">{t.logged}</b></div>
            <div><span>Typed in the sheet</span><b className="num">{t.typed}</b></div>
            <div className={t.waiting || t.leaving || t.missing ? "r" : "g"}><span>Not matching</span><b className="num">{t.waiting + t.leaving + t.missing}</b></div>
          </div>
        )}

        {res && !issues && <div className="notice ok" role="status">{res.fixed ? "Done. " : ""}The sheet and the dashboard match for {res.month}. Everything logged here is in the sheet{t.typed ? `, and ${t.typed} sign-up${t.typed === 1 ? " was" : "s were"} typed straight into the sheet` : ""}.</div>}

        {res && issues > 0 && (
          <>
            <ul className="cmpwhy">
              {t.waiting > 0 && <li><b>{t.waiting}</b> logged here {t.waiting === 1 ? "isn't" : "aren't"} in the sheet yet{t.waitingRevenue ? ` (${usd(t.waitingRevenue)} revenue)` : ""}.</li>}
              {t.leaving > 0 && <li><b>{t.leaving}</b> removed here {t.leaving === 1 ? "is" : "are"} still in the sheet.</li>}
              {t.missing > 0 && <li><b>{t.missing}</b> logged here {t.missing === 1 ? "was" : "were"} added to the sheet before but {t.missing === 1 ? "is" : "are"} missing from it now (someone may have changed the number).</li>}
              {res.notInSheet.length > 0 && <li>Only on the dashboard, since these agents have no row in the sheet: {res.notInSheet.join(", ")}.</li>}
            </ul>
            <div className="setacts">
              {canWrite && <button className="b pri" disabled={!!busy} onClick={() => confirm(`Update the sheet for ${month} so it has everything logged on the dashboard?`) && run("sheet")}>{busy === "sheet" ? "Updating the sheet…" : "Make the sheet match the dashboard"}</button>}
              <button className="b" disabled={!!busy} onClick={() => confirm(`Let the sheet win for ${month}? Sign-ups logged here that aren't in the sheet will stop counting, and missing ones are accepted as they are. The sheet isn't changed.`) && run("dashboard")}>{busy === "dashboard" ? "Updating the dashboard…" : "Make the dashboard match the sheet"}</button>
            </div>
            {!canWrite && <p className="note">Reconnect Google Drive (in Sales file below) to let the app update the sheet.</p>}
          </>
        )}

        {res && res.rows.length > 0 && (
          <div className="cmp">
            <div className="cmp-h cmp4" aria-hidden="true"><span>Agent</span><span>Sheet</span><span>Logged here</span><span>Typed in sheet</span><span>Status</span></div>
            {shown.map((r) => (
              <div className={`cmp-r cmp4 ${r.off ? "off" : ""}`} key={r.team + r.agent}>
                <span><b>{r.agent}</b><small className="tm">{r.team}</small></span>
                <span className="num"><small>Sheet</small>{r.sheet}</span>
                <span className="num"><small>Logged here</small>{r.logged}</span>
                <span className="num"><small>Typed</small>{r.typed}</span>
                <span className="st-t">{r.waiting ? `${r.waiting} not in sheet yet` : r.leaving ? `${r.leaving} still to take off` : r.missing ? `${r.missing} missing from sheet` : "Matches"}</span>
              </div>
            ))}
            {!shown.length && <p className="note pad">Every agent matches.</p>}
            <button className="b txt more" onClick={() => setAll(!all)}>{all ? "Show only ones to check" : `Show all ${res.rows.length} agents with sign-ups`}</button>
          </div>
        )}
      </div>
    </section>
  );
}
