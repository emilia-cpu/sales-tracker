"use client";
// Settings → Teams & agents: the admin adds agents to a team, removes any agent, restores removed ones, and sets
// each agent's target, month by month. The sheet isn't changed; the dashboard and the "Log a sign-up" form follow these changes.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Header";

// An agent's target: type a number and Save. Empty puts a sheet agent back on the sheet's target.
function TargetBox({ a, busy, onSave }) {
  const shown = a.target == null ? "" : String(a.target);
  const [v, setV] = useState(shown);
  const dirty = v !== shown;
  return (
    <form className="tbox" onSubmit={(e) => { e.preventDefault(); if (dirty) onSave(v); }}>
      <label>
        <span className="sr">Target for {a.name}</span>
        <input value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={4} placeholder="—" aria-label={`Target for ${a.name}`} />
      </label>
      {dirty && <button className="b pri" disabled={busy}>Save</button>}
    </form>
  );
}

export default function RosterEditor({ months, month, teams, removed }) {
  const router = useRouter();
  const [team, setTeam] = useState("");
  const [agent, setAgent] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(null); // team whose agents are shown

  async function change(action, t, a, extra = {}) {
    setBusy(action + t + a); setMsg(null);
    try {
      const res = await fetch("/api/roster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, action, team: t, agent: a, ...extra }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Couldn't save. Try again.");
      setMsg({ ok: true, t: action === "add" ? `Added ${a} to ${t} for ${month}.` : action === "remove" ? `Removed ${a} from ${t} for ${month}.` : action === "target" ? `${a}'s target for ${month} is now ${extra.target === "" ? "the sheet's" : extra.target}.` : `${a} is back in ${t}.` });
      if (action === "add") { setAgent(""); setTarget(""); setOpen(t); }
      router.refresh();
      return true;
    } catch (e) {
      setMsg({ ok: false, t: e.message });
      return false;
    } finally {
      setBusy("");
    }
  }

  function add(e) {
    e.preventDefault();
    if (!team) return setMsg({ ok: false, t: "Choose a team." });
    if (!agent.trim()) return setMsg({ ok: false, t: "Enter the agent's name." });
    change("add", team, agent.trim(), { target });
  }

  return (
    <section className="card" aria-label="Teams and agents">
      <div className="card-h">
        <h2>Teams &amp; agents</h2>
        <span className="sp" />
        <label className="sel month">
          <span className="sr">Month</span>
          <select value={month} onChange={(e) => { window.location.href = `/settings?rm=${encodeURIComponent(e.target.value)}#teams`; }}>
            {months.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
      </div>
      <div className="setbody" id="teams">
        <p className="muted">Add an agent to any team, take one out, or change an agent's target, for <b>{month}</b>. Changes apply to this month only and show on the dashboard and in "Log a sign-up" right away. The sheet itself isn't changed.</p>

        <form className="rosteradd" onSubmit={add}>
          <label>Team
            <span className="sel"><select value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">Choose team</option>
              {teams.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select></span>
          </label>
          <label>Agent name
            <input value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="Full name" maxLength={60} autoComplete="off" />
          </label>
          <label className="tgt">Target <small>(optional)</small>
            <input value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Sign-ups" maxLength={4} />
          </label>
          <button className="b pri" disabled={!!busy}>{busy.startsWith("add") ? "Adding…" : "Add agent"}</button>
        </form>
        {msg && <div className={`notice ${msg.ok ? "ok" : ""}`} role="status">{msg.t}</div>}

        <ul className="rteams">
          {teams.map((t, i) => (
            <li key={t.name}>
              <button type="button" className="rteam" aria-expanded={open === t.name} onClick={() => setOpen(open === t.name ? null : t.name)}>
                <Avatar name={t.leader} i={i} />
                <span className="who"><b>{t.name}</b><span>{t.agents.length} agents · target {t.agents.reduce((n, a) => n + (a.target || 0), 0)}{t.agents.some((a) => a.added) && ` · ${t.agents.filter((a) => a.added).length} added here`}</span></span>
                <span className="chev" aria-hidden="true" />
              </button>
              {open === t.name && (
                <ul className="ragents">
                  {t.agents.map((a) => (
                    <li key={a.name}>
                      <span className="who"><b>{a.name}</b><span>{a.added ? <em className="tagpill">Added here</em> : a.targetSet ? `Sheet target ${a.sheetTarget ?? "—"} · changed here` : "Target from the sheet"}</span></span>
                      <TargetBox key={`${a.name}:${a.target}`} a={a} busy={!!busy} onSave={(v) => change("target", t.name, a.name, { target: v })} />
                      <button className="b no" disabled={!!busy} onClick={() => confirm(`Remove ${a.name} from ${t.name} for ${month}?`) && change("remove", t.name, a.name)}>
                        {busy === "remove" + t.name + a.name ? "Removing…" : "Remove"}
                      </button>
                    </li>
                  ))}
                  {!t.agents.length && <li className="note">No agents in this team for {month}.</li>}
                </ul>
              )}
            </li>
          ))}
        </ul>

        {removed.length > 0 && (
          <div className="rremoved">
            <h3>Removed for {month}</h3>
            <ul className="ragents">
              {removed.map((x) => (
                <li key={x.team + x.agent}>
                  <span className="who"><b>{x.agent}</b><span>{x.team} · removed by {x.by}</span></span>
                  <button className="b" disabled={!!busy} onClick={() => change("restore", x.team, x.agent)}>{busy === "restore" + x.team + x.agent ? "Restoring…" : "Restore"}</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="note">Sign-ups already logged for a removed agent still count toward the team and floor totals.</p>
      </div>
    </section>
  );
}
