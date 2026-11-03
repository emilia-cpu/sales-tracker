"use client";
// "Log a sign-up": Account or Sale, then team, then one of that team's agents, then the client's name.
// The browser remembers the last team and agent picked, since people mostly log for themselves.
import { useEffect, useState } from "react";

const MEMO = "st-last-agent";

export default function LogSignup({ roster, onLogged }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("");
  const [team, setTeam] = useState("");
  const [agent, setAgent] = useState("");
  const [client, setClient] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    try {
      const last = JSON.parse(localStorage.getItem(MEMO) || "null");
      const t = roster.find((x) => x.name === last?.team);
      if (t) { setTeam(t.name); if (t.agents.includes(last.agent)) setAgent(last.agent); }
    } catch {}
  }, [open, roster]);

  const agents = roster.find((t) => t.name === team)?.agents || [];
  const reset = () => { setType(""); setClient(""); setErr(""); };

  async function save(e) {
    e.preventDefault();
    if (!type) return setErr("Choose Account or Sale.");
    if (!team || !agent) return setErr("Choose the team and the agent.");
    if (!client.trim()) return setErr("Enter the client name.");
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, team, agent, client }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Couldn't save. Try again.");
      try { localStorage.setItem(MEMO, JSON.stringify({ team, agent })); } catch {}
      reset();
      setOpen(false);
      onLogged(j.entry);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="logbar">
        <button className="b pri logbtn" onClick={() => setOpen(true)}><span aria-hidden="true">+</span> Log a sign-up</button>
        <span className="note">Each sale or account you log counts toward the agent, team and floor targets right away.</span>
      </div>
    );
  }

  return (
    <form className="card logform" onSubmit={save}>
      <div className="card-h"><h2>Log a sign-up</h2><span className="sp" /><button type="button" className="b txt" onClick={() => { reset(); setOpen(false); }}>Cancel</button></div>
      <div className="logbody">
        <fieldset className="kind">
          <legend>Is it a sale or an account?</legend>
          <button type="button" className={`kindbtn acc`} aria-pressed={type === "account"} onClick={() => setType("account")}><b>Account</b><span>New account sign-up</span></button>
          <button type="button" className={`kindbtn sale`} aria-pressed={type === "sale"} onClick={() => setType("sale")}><b>Sale</b><span>New sale</span></button>
        </fieldset>
        <div className="logfields">
          <label>Team
            <span className="sel"><select value={team} onChange={(e) => { setTeam(e.target.value); setAgent(""); }}>
              <option value="">Choose team</option>
              {roster.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select></span>
          </label>
          <label>Agent
            <span className="sel"><select value={agent} onChange={(e) => setAgent(e.target.value)} disabled={!team}>
              <option value="">{team ? "Choose agent" : "Choose a team first"}</option>
              {agents.map((a) => <option key={a} value={a}>{a}</option>)}
            </select></span>
          </label>
          <label className="wide">Client name
            <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Business or client name" maxLength={120} autoComplete="off" />
          </label>
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="logacts">
          <button className="b pri" disabled={busy}>{busy ? "Saving…" : type === "sale" ? "Log sale" : type === "account" ? "Log account" : "Log sign-up"}</button>
          {agent && type && <span className="note">Adds 1 {type} for {agent} ({team}).</span>}
        </div>
      </div>
    </form>
  );
}
