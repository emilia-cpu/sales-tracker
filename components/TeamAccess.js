"use client";
// Settings → Team access: who can sign in, and whether each person is a User (dashboard + Log a sign-up)
// or an Admin (also Settings). The owner can't be changed here.
import { useState } from "react";
import { useRouter } from "next/navigation";

const when = (iso) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function TeamAccess({ me, people, fixed }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);

  async function change(action, e, r) {
    setBusy(action + e); setMsg(null);
    try {
      const res = await fetch("/api/people", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, email: e, role: r }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Couldn't save. Try again.");
      setMsg({ ok: true, t: action === "add" ? `${e} can now sign in as ${r === "admin" ? "an admin" : "a user"}.` : action === "role" ? `${e} is now ${r === "admin" ? "an admin" : "a user"}.` : `${e} no longer has access.` });
      if (action === "add") { setEmail(""); setRole("user"); }
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, t: err.message });
    } finally {
      setBusy("");
    }
  }

  const rows = Object.entries(people).filter(([e]) => !fixed.includes(e)).sort((a, b) => (a[1].role === b[1].role ? a[0].localeCompare(b[0]) : a[1].role === "admin" ? -1 : 1));

  return (
    <section className="card" aria-label="Team access">
      <div className="card-h"><h2>Team access</h2><span className="badge n">{rows.length + fixed.length}</span></div>
      <div className="setbody">
        <p className="muted">Only people on this list can sign in. <b>Users</b> see the dashboard and can log sign-ups. <b>Admins</b> can also open Settings: the sales file, teams &amp; agents, and this list.</p>
        <form className="accessadd" onSubmit={(e) => { e.preventDefault(); change("add", email.trim(), role); }}>
          <label>Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@myaio.com" autoComplete="off" required />
          </label>
          <label>Access
            <span className="sel"><select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select></span>
          </label>
          <button className="b pri" disabled={!!busy}>{busy.startsWith("add") ? "Adding…" : "Add person"}</button>
        </form>
        {msg && <div className={`notice ${msg.ok ? "ok" : ""}`} role="status">{msg.t}</div>}
        <ul className="ragents people">
          {fixed.map((e) => (
            <li key={e}>
              <span className="who"><b>{people[e]?.name || e}</b><span>{people[e]?.name ? `${e} · ` : ""}{people[e]?.lastSeen ? `last signed in ${when(people[e].lastSeen)}` : "owner"}</span></span>
              <span className="tagpill">Owner · Admin</span>
            </li>
          ))}
          {rows.map(([e, p]) => (
            <li key={e}>
              <span className="who"><b>{p.name || e}</b><span>{p.name ? `${e} · ` : ""}{p.lastSeen ? `last signed in ${when(p.lastSeen)}` : "hasn't signed in yet"}</span></span>
              <span className="sel small"><select aria-label={`Access for ${e}`} value={p.role} disabled={!!busy || e === me} onChange={(ev) => change("role", e, ev.target.value)}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select></span>
              {e === me ? <span className="note">You</span> : (
                <button className="b no" disabled={!!busy} onClick={() => confirm(`Remove access for ${e}? They'll be signed out.`) && change("remove", e)}>{busy === "remove" + e ? "Removing…" : "Remove"}</button>
              )}
            </li>
          ))}
        </ul>
        {!rows.length && <p className="note">Nobody else has access yet. Add your team's emails above.</p>}
      </div>
    </section>
  );
}
