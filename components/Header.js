"use client";
import { useEffect, useState } from "react";
import { ptClock } from "@/lib/time";

// Top bar: title, date, month picker (one per sheet tab), Dashboard/Settings tabs (admins), who's signed in.
export const AV = ["#2b82f7", "#9b4de0", "#ea0e96", "#f28a00", "#1fa64a", "#0fa3bf", "#5b5bd6", "#d6455d"];
const initials = (n) => String(n || "?").replace(/[^A-Za-z&\s]/g, "").split(/[\s&]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

export function Avatar({ name, i = 0, big }) {
  return <i className={`av ${big ? "big" : ""}`} style={{ background: AV[i % 8] }} aria-hidden="true">{initials(name)}</i>;
}

export default function Header({ me, today, months = [], title, active = "dashboard" }) {
  // Current Pacific time, shown after the page loads (so server and browser agree).
  const [clock, setClock] = useState("");
  useEffect(() => {
    setClock(ptClock());
    const t = setInterval(() => setClock(ptClock()), 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <header>
      <img src="/brand-mark.svg" alt="MyAIO" className="logoimg" width="56" height="34" />
      <div className="hgrow"><h1>SALES TARGET</h1><p>Lahore sales floor · {new Date(today + "T12:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}{clock ? ` · ${clock}` : ""}</p></div>
      {me.admin && (
        <nav className="navtabs" aria-label="Pages">
          <a href="/" aria-current={active === "dashboard" ? "page" : undefined}>Dashboard</a>
          <a href="/settings" aria-current={active === "settings" ? "page" : undefined}>Settings</a>
        </nav>
      )}
      {months.length > 0 && (
        <label className="sel month">
          <span className="sr">Month</span>
          <select value={title} onChange={(e) => { window.location.href = `/?m=${encodeURIComponent(e.target.value)}`; }}>
            {months.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
      )}
      <div className="who-me">
        <span className="email">{me.email}</span>
        <form action="/api/auth/logout" method="post"><button className="signout">Sign out</button></form>
      </div>
    </header>
  );
}
