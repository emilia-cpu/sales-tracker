"use client";
// One month of the Lahore sales floor: floor target, weekly targets, teams, and every agent's sign-ups.
// Green only means a target is complete; in progress is blue.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header, { Avatar } from "@/components/Header";
import LogSignup from "@/components/LogSignup";
import { ptISO } from "@/lib/time";

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));
// Whole dollars as "$1,250", cents as "$1,250.50".
const usd = (n) => { const d = Number.isInteger(Number(n)) ? 0 : 2; return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); };
const pct = (a, t) => (t > 0 ? Math.round((a / t) * 100) : null);
const width = (a, t) => (t > 0 ? Math.min(100, (a / t) * 100) : 0);
// Accounts/sales split, or null when the sheet only has placeholder zeros.
const splitOf = (x) => (x.accounts || x.sales ? { accounts: x.accounts || 0, sales: x.sales || 0 } : null);

function status(a) {
  if (!(a.target > 0)) return a.signups > 0 ? { k: "b", t: "No target", i: "•" } : { k: "m", t: "No target", i: "–" };
  if (a.signups >= a.target) return { k: "g", t: "Target hit", i: "✓" };
  if (a.signups > 0) return { k: "b", t: `${fmt(a.target - a.signups)} to go`, i: "↑" };
  return { k: "r", t: "No sign-ups", i: "!" };
}

const Ic = {
  target: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>,
  left: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  split: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
};

// Where the floor should be by today if sign-ups came in evenly over the month (this month only).
function pace(target, today, title, current) {
  if (title !== current || !(target > 0)) return null;
  const [y, m, d] = today.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  return { expected: Math.round((target * d) / days), at: (d / days) * 100 };
}

const clock = (iso) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function Dashboard({ me, today, current, months, month, updated, source, error, roster }) {
  const [team, setTeam] = useState("all");
  const [toast, setToast] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [listOpen, setListOpen] = useState(false); // agent list stays closed until someone opens it
  const router = useRouter();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  async function remove(e, quiet) {
    const res = await fetch(`/api/entries/${e.id}?m=${encodeURIComponent(current)}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    setToast({ text: res.ok ? `Removed the ${e.type} for ${e.client}.` : j.error || "Couldn't remove it." });
    if (res.ok || quiet) router.refresh();
  }
  function logged(e) {
    setToast({ text: `Logged ${e.type === "sale" ? "a sale" : "an account"} for ${e.agent} · ${e.client}`, undo: e });
    if (month?.title !== current) window.location.href = "/";
    else router.refresh();
  }
  // Live data: pull the latest from the sheet every minute (filters stay as they are).
  useEffect(() => {
    if (source !== "live") return;
    const t = setInterval(() => router.refresh(), 60000);
    return () => clearInterval(t);
  }, [source, router]);
  const [tab, setTab] = useState("all");

  const agents = useMemo(() => {
    if (!month) return [];
    return month.teams.flatMap((t, ti) => t.agents.map((a) => ({ ...a, team: t.name, ti })));
  }, [month]);

  if (!month) {
    return (
      <div className="wrap">
        <Header me={me} today={today} months={months} title="" />
        {source === "live"
          ? <div className="card empty"><b>No month tabs found</b>The sheet has no tabs named like "November 2026".</div>
          : <div className="card empty"><b>The sales sheet isn't connected yet</b>{me.admin ? <><a href="/settings">Connect Google Drive</a> in Settings to load the teams, agents and targets.</> : "An admin needs to connect it in Settings."}</div>}
      </div>
    );
  }

  const { floor, weeks, teams } = month;
  const fp = pct(floor.achieved, floor.target);
  const remaining = floor.target - floor.achieved;
  const split = splitOf(month.totals);
  const pc = pace(floor.target, today, month.title, current);
  const empty = floor.achieved === 0 && agents.every((a) => !a.signups);
  const noTargets = agents.length > 0 && agents.every((a) => !(a.target > 0));

  const ranked = teams.map((t, i) => ({ ...t, i, p: pct(t.signups, t.target) })).sort((a, b) => (b.p ?? -1) - (a.p ?? -1) || b.signups - a.signups);
  const top = [...agents].filter((a) => a.signups > 0).sort((a, b) => b.signups - a.signups || (pct(b.signups, b.target) ?? 0) - (pct(a.signups, a.target) ?? 0)).slice(0, 5);

  const inTeam = agents.filter((a) => team === "all" || a.team === team);
  const groups = {
    all: inTeam,
    hit: inTeam.filter((a) => a.target > 0 && a.signups >= a.target),
    prog: inTeam.filter((a) => a.target > 0 && a.signups > 0 && a.signups < a.target),
    none: inTeam.filter((a) => a.target > 0 && !a.signups),
  };
  const rows = [...groups[tab]].sort((a, b) => (pct(b.signups, b.target) ?? -1) - (pct(a.signups, a.target) ?? -1) || b.signups - a.signups || a.name.localeCompare(b.name));
  const sum = (f) => inTeam.reduce((s, a) => s + (a[f] || 0), 0);
  const tsplit = splitOf({ accounts: sum("accounts"), sales: sum("sales") });
  // Sign-ups still owed by agents below their target (agents over target don't cancel this out).
  const needed = inTeam.reduce((s, a) => s + Math.max(0, (a.target || 0) - a.signups), 0);

  return (
    <div className="wrap">
      <Header me={me} today={today} months={months} title={month.title} />
      {roster && <LogSignup roster={roster} onLogged={logged} />}

      {(empty || noTargets) && (
        <div className="banner" role="status">
          <b>{month.title} is just getting started.</b>{" "}
          {empty && (month.logged ? "No sign-ups logged yet. Use Log a sign-up when a sale or account comes in." : "No sign-ups are in the sheet yet.")} {noTargets && "Agent targets haven't been entered yet, so team progress shows once they are."}
        </div>
      )}

      <section className="kpis" aria-label="Floor totals">
        <div className="card kpi t"><div className="kpi-top"><span className="kpi-ic">{Ic.target}</span><span className="kpi-l">Floor target</span></div><div className="kpi-v num">{fmt(floor.target)}</div><div className="kpi-s">sign-ups for {month.title.split(" ")[0]}</div></div>
        <div className={`card kpi ${fp >= 100 ? "c" : "a"}`}><div className="kpi-top"><span className="kpi-ic">{Ic.check}</span><span className="kpi-l">Achieved</span></div><div className="kpi-v num">{fmt(floor.achieved)}</div><div className="kpi-s">{fp == null ? "no target yet" : `${fp}% of target`}</div></div>
        <div className={`card kpi ${remaining > 0 ? "l" : "c"}`}><div className="kpi-top"><span className="kpi-ic">{Ic.left}</span><span className="kpi-l">{remaining >= 0 ? "Remaining" : "Over target"}</span></div><div className="kpi-v num">{fmt(Math.abs(remaining))}</div><div className="kpi-s">{remaining > 0 ? (pc ? `${pc.expected} expected by today` : "sign-ups still needed") : remaining === 0 && floor.target ? "target reached" : remaining < 0 ? "above target" : "—"}</div></div>
        <div className="card kpi u"><div className="kpi-top"><span className="kpi-ic">{Ic.split}</span><span className="kpi-l">Accounts / Sales</span></div><div className="kpi-v num">{split ? `${split.accounts} / ${split.sales}` : "—"}</div><div className="kpi-s">{split ? "accounts · sales" : "no split yet"}</div></div>
      </section>

      <section className="card prog" aria-label="Floor progress">
        <div className="prog-h">
          <b>Floor progress</b>
          <span><strong className="num">{fmt(floor.achieved)}</strong> of <strong className="num">{fmt(floor.target)}</strong> sign-ups{fp != null && <> · <strong className="num">{fp}%</strong></>}</span>
        </div>
        <div className="track">
          <i style={{ width: `${width(floor.achieved, floor.target)}%`, background: fp >= 100 ? "var(--g)" : undefined }} />
          {pc && <em className="pace" style={{ left: `${pc.at}%` }} title={`Expected by today: ${pc.expected}`} />}
        </div>
        <div className="split">
          {split && <span><i style={{ background: "var(--blue)" }} />Accounts <strong className="num">{split.accounts}</strong></span>}
          {split && <span><i style={{ background: "var(--u)" }} />Sales <strong className="num">{split.sales}</strong></span>}
          {month.totals.revenue > 0 && <span><i style={{ background: "var(--g)" }} />Revenue <strong className="num">{usd(month.totals.revenue)}</strong></span>}
          {pc && <span><i className="pacekey" />Expected by today <strong className="num">{pc.expected}</strong>{floor.achieved >= pc.expected ? <em className="ahead">on pace</em> : <em className="behind">{pc.expected - floor.achieved} behind</em>}</span>}
        </div>
      </section>

      {weeks.length > 0 && (
        <section className="card" aria-label="Weekly targets">
          <div className="card-h"><h2>Weekly targets</h2><span className="sp" /><span className="note">{month.logged ? "Mon–Sun weeks · targets from the sheet" : "Weeks as set in the sheet"}</span></div>
          <div className="weeks">
            {weeks.map((w) => {
              const p = pct(w.achieved, w.target), s = splitOf(w), left = w.target - w.achieved;
              return (
                <div className="wk" key={w.n}>
                  <div className="wk-h"><b>Week {w.n}{w.range && <small>{month.title.slice(0, 3)} {w.range}</small>}</b><span className={`wpct ${p >= 100 ? "done" : p ? "" : "none"}`}>{p == null ? "—" : `${p}%`}</span></div>
                  <div className="wk-v num"><strong>{fmt(w.achieved)}</strong><span>/ {fmt(w.target)}</span></div>
                  <div className="bar"><i style={{ width: `${width(w.achieved, w.target)}%`, background: p >= 100 ? "var(--g)" : undefined }} /></div>
                  <div className="wk-s">{w.target ? (left > 0 ? `${fmt(left)} to go` : left === 0 ? "Target hit" : `${fmt(-left)} over`) : "No target"}{s && <> · {s.accounts} acc / {s.sales} sales</>}</div>
                  {(w.mrr || w.upsell || w.revenue) ? <div className="wk-r num">{w.revenue ? <span>Revenue <b>{usd(w.revenue)}</b></span> : null}{w.mrr ? <span>MRR <b>{usd(w.mrr)}</b></span> : null}{w.upsell ? <span>Upsell <b>{usd(w.upsell)}</b></span> : null}</div> : null}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="cols">
        <section className="card" aria-label="Teams">
          <div className="card-h"><h2>Teams</h2><span className="badge n">{teams.length}</span><span className="sp" /><span className="note">Click a team to see its agents</span></div>
          <div className="ag-list">
            {ranked.map((t, r) => {
              const s = splitOf(t);
              return (
                <button key={t.name} className="ag" aria-pressed={team === t.name} onClick={() => { setTeam(team === t.name ? "all" : t.name); setTab("all"); setListOpen(true); document.getElementById("agents")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
                  <span className="rk num">{r + 1}</span>
                  <Avatar name={t.leader} i={t.i} />
                  <span className="who">
                    <b>{t.name}</b>
                    <span className="num">{fmt(t.signups)} of {fmt(t.target)} · {t.agents.length} agents{s && ` · ${s.accounts} acc / ${s.sales} sales`}{t.revenue > 0 && ` · ${usd(t.revenue)}`}</span>
                    <span className="bar"><i style={{ width: `${width(t.signups, t.target)}%`, background: t.p >= 100 ? "var(--g)" : "var(--blue)" }} /></span>
                  </span>
                  <span className={`pc num ${t.p >= 100 ? "done" : ""}`}>{t.p == null ? "—" : `${t.p}%`}</span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="stack">
        <section className="card" aria-label="Top agents">
          <div className="card-h"><h2>Top agents</h2><span className="sp" /><span className="note">Most sign-ups</span></div>
          {top.length ? (
            <ol className="top">
              {top.map((a, r) => (
                <li key={a.team + a.name}>
                  <span className={`medal m${r + 1}`}>{r + 1}</span>
                  <Avatar name={a.name} i={a.ti} />
                  <span className="who"><b>{a.name}</b><span>{a.team}</span></span>
                  <span className="score num"><b>{fmt(a.signups)}</b>{a.target > 0 && <small>of {fmt(a.target)}</small>}</span>
                </li>
              ))}
            </ol>
          ) : <div className="empty"><b>No sign-ups yet</b>Top agents show here once sign-ups come in.</div>}
        </section>

        {month.logged && (
          <section className="card" aria-label="Recent sign-ups">
            <div className="card-h"><h2>Recent sign-ups</h2><span className="badge n">{month.entries.length}</span><span className="sp" /><span className="note">{month.entries.filter((e) => ptISO(new Date(e.at)) === today).length} today</span></div>
            {month.entries.length ? (
              <>
                <ul className="recent">
                  {(showAll ? month.entries : month.entries.slice(0, 8)).map((e) => (
                    <li key={e.id}>
                      <span className={`kind-pill ${e.type}`}>{e.type === "sale" ? "Sale" : "Account"}</span>
                      <span className="who"><b>{e.client}</b><span>{e.agent} · {e.team}</span></span>
                      <span className="when">{e.revenue > 0 && <b className="rev">{usd(e.revenue)}</b>}{clock(e.at)}{(e.by === me.email || me.admin) && <button className="b txt rm" onClick={() => confirm(`Remove the ${e.type} for ${e.client} (${e.agent})?`) && remove(e)}>Remove</button>}</span>
                    </li>
                  ))}
                </ul>
                {month.entries.length > 8 && <button className="b txt more" onClick={() => setShowAll(!showAll)}>{showAll ? "Show less" : `Show all ${month.entries.length}`}</button>}
              </>
            ) : <div className="empty"><b>Nothing logged yet</b>Sales and accounts show here as they're logged.</div>}
          </section>
        )}
        </div>
      </div>

      <section className="card" id="agents" aria-label="Agents">
        <div className="tbl-h">
          <div className="pick">
            {team === "all" ? <Avatar name="All" i={0} big /> : <Avatar name={teams.find((t) => t.name === team)?.leader} i={teams.findIndex((t) => t.name === team)} big />}
            <div>
              <label htmlFor="team">Agents</label>
              <span className="sel"><select id="team" value={team} onChange={(e) => { setTeam(e.target.value); setTab("all"); setListOpen(true); }}>
                <option value="all">All teams</option>
                {teams.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select></span>
            </div>
          </div>
          <button className={`b ${listOpen ? "" : "pri"} listtoggle`} aria-expanded={listOpen} aria-controls="agentlist" onClick={() => setListOpen(!listOpen)}>
            {listOpen ? "Hide agents" : `Show agents (${inTeam.length})`}
          </button>
          {listOpen && <div className="tabs" role="group" aria-label="Filter agents">
            {[["all", "All", ""], ["hit", "Target hit", "g"], ["prog", "In progress", "b"], ["none", "No sign-ups", "r"]].map(([k, l, c]) => (
              <button key={k} className={`tab ${c}`} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}<em>{groups[k].length}</em></button>
            ))}
          </div>}
        </div>
        {listOpen && <div id="agentlist">
        <div className="sums">
          <div><span>Target</span><b className="num">{fmt(sum("target"))}</b></div>
          <div className="a"><span>Sign-ups</span><b className="num">{fmt(sum("signups"))}</b></div>
          <div><span>Accounts / Sales</span><b className="num">{tsplit ? `${tsplit.accounts} / ${tsplit.sales}` : "—"}</b></div>
          <div className={needed > 0 ? "y" : "g"}><span>Still needed</span><b className="num">{fmt(needed)}</b></div>
        </div>
        <div className="th at" aria-hidden="true"><span>Agent</span><span>Target</span><span>Sign-ups</span><span>Acc / Sales</span><span>Progress</span><span>Status</span></div>
        {rows.length ? (
          <ul className="rows">
            {rows.map((a) => {
              const st = status(a), p = pct(a.signups, a.target), s = splitOf(a);
              return (
                <li className="tr at" key={a.team + a.name}>
                  <span className="cn"><Avatar name={a.name} i={a.ti} /><span><b>{a.name}</b><span>{a.team}</span></span></span>
                  <span className="num c-t"><small>Target</small>{fmt(a.target)}</span>
                  <span className="num c-s"><small>Sign-ups</small><b>{fmt(a.signups)}</b></span>
                  <span className="num c-as"><small>Acc / Sales</small>{s ? `${s.accounts} / ${s.sales}` : "—"}{a.revenue > 0 && <em className="rev">{usd(a.revenue)}</em>}</span>
                  <span className="c-p"><span className="bar"><i style={{ width: `${width(a.signups, a.target)}%`, background: p >= 100 ? "var(--g)" : "var(--blue)" }} /></span><span className="num">{p == null ? "—" : `${p}%`}</span></span>
                  <span className="c-st"><span className={`st ${st.k}`}><i>{st.i}</i>{st.t}</span></span>
                </li>
              );
            })}
          </ul>
        ) : <div className="empty"><b>Nobody here</b>No agents match this filter.</div>}
        </div>}
      </section>

      {toast && (
        <div className="toast" role="status">
          {toast.text}
          {toast.undo && <button className="undo" onClick={() => { const e = toast.undo; setToast(null); remove(e, true); }}>Undo</button>}
        </div>
      )}

      <p className="foot">
        {month.logged && "Sign-ups are counted from what's logged here; teams, agents and targets come from the sheet. "}{source === "live" ? "Live from" : "Saved copy of"} "Lahore Sales Target" · last edited {new Date(updated).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
        {error && <><br /><span className="warn">Couldn't read the sheet just now: {error}</span></>}
        {source !== "live" && me.admin && <><br /><a href="/settings">Connect Google Drive</a> to show live numbers.</>}
      </p>
    </div>
  );
}
