"use client";
// Settings → Compare with sheet: reads the sales file fresh and lists every number where the sheet and the dashboard
// disagree for a month, with a button to make the sheet match the dashboard.
import { useState } from "react";

const when = (iso) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const show = (v, kind) => {
  if (v === "" || v == null) return "blank";
  if (kind === "usd") { const n = Number(String(v).replace(/[$,]/g, "")); return Number.isFinite(n) ? "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(v); }
  if (kind === "split") return v === 0 || v === "0" ? "0/0" : String(v);
  return String(v);
};

export default function SheetCompare({ months, current, canWrite }) {
  const [month, setMonth] = useState(months.includes(current) ? current : months[0]);
  const [busy, setBusy] = useState("");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");

  async function run(fix) {
    setBusy(fix ? "fix" : "check"); setErr("");
    try {
      const r = await fetch(`/api/sheet/compare?month=${encodeURIComponent(month)}`, { method: fix ? "POST" : "GET" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't read the sheet.");
      setRes({ ...j, fixed: fix });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }

  const groups = res ? Object.entries(res.diffs.reduce((g, d) => ((g[d.where] = g[d.where] || []).push(d), g), {})) : [];

  return (
    <section className="card" aria-labelledby="h-cmp">
      <div className="card-h">
        <h2 id="h-cmp">Compare with sheet</h2>
        {res && <span className={`badge ${res.diffs.length ? "r" : "g"}`}>{res.diffs.length ? `${res.diffs.length} different` : "Matches"}</span>}
        <span className="sp" />
        {months.length > 1 && (
          <label className="sel month"><span className="sr">Month</span>
            <select value={month} onChange={(e) => { setMonth(e.target.value); setRes(null); }}>{months.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
        )}
      </div>
      <div className="setbody">
        <p className="muted">Reads <b>Lahore Sales Target.xlsx</b> fresh from Drive and checks {month} against the dashboard: every agent's sign-ups and accounts/sales, targets changed in Settings, the floor's achieved, and each week's numbers and revenue.</p>
        <div className="setacts">
          <button className="b pri" disabled={!!busy} onClick={() => run(false)}>{busy === "check" ? "Comparing…" : res ? "Compare again" : "Compare now"}</button>
          {res?.diffs.length > 0 && canWrite && <button className="b" disabled={!!busy} onClick={() => confirm(`Write the dashboard's numbers for ${month} into the sheet? The ${res.diffs.length} cells listed will change.`) && run(true)}>{busy === "fix" ? "Writing…" : "Make the sheet match"}</button>}
          {res && <span className="note">Checked {res.checked} numbers · sheet last edited {when(res.sheetEdited)}</span>}
        </div>
        {err && <div className="notice" role="alert">{err}</div>}
        {res && !res.diffs.length && <div className="notice ok" role="status">{res.fixed ? "Done. " : ""}Everything matches: the sheet has the same numbers as the dashboard for {res.month}.</div>}
        {res?.diffs.length > 0 && (
          <div className="cmp">
            <div className="cmp-h" aria-hidden="true"><span>What</span><span>Sheet</span><span>Dashboard</span><span>Cell</span></div>
            {groups.map(([where, list]) => (
              <div key={where} className="cmp-g">
                <b className="cmp-w">{where}</b>
                {list.map((d) => (
                  <div className="cmp-r" key={d.ref}>
                    <span>{d.what}</span>
                    <span className="cmp-s num"><small>Sheet</small>{show(d.sheet, d.kind)}</span>
                    <span className="cmp-d num"><small>Dashboard</small>{show(d.dashboard, d.kind)}</span>
                    <span className="cmp-c">{d.ref}</span>
                  </div>
                ))}
              </div>
            ))}
            {!canWrite && <p className="note">Reconnect Google Drive (in Sales file below) to let the app fix these.</p>}
          </div>
        )}
        {res?.calculated?.length > 0 && <p className="note">Calculated by the sheet's own formulas, so not compared or written: {res.calculated.map((c) => `${c.where} · ${c.what} (${c.ref})`).join(", ")}.</p>}
        {res?.notInSheet?.length > 0 && <p className="note">Not in the sheet, so not compared: {res.notInSheet.join(", ")}. Add them to the {res.month} tab.</p>}
      </div>
    </section>
  );
}
