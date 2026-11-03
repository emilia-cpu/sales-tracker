"use client";
// Sign-in, in two steps like MY AIO CRM: a short splash with the glowing logo, then the sign-in card.
import { useEffect, useState } from "react";

// Soft blue/violet/pink backdrop with a few floating dots, shared with the "no access" screen.
export function Backdrop() {
  return (
    <div className="lbg" aria-hidden="true">
      <i className="blob b1" /><i className="blob b2" /><i className="blob b3" /><i className="blob b4" />
      <i className="dot d1" /><i className="dot d2" /><i className="dot d3" /><i className="dot d4" /><i className="dot d5" />
    </div>
  );
}

const G = (
  <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

export default function LoginScreen({ notice, noticeOk, skipSplash }) {
  // Splash shows once per browser session, and never when there's a message to read.
  const [stage, setStage] = useState(skipSplash ? "card" : "splash");
  useEffect(() => {
    if (stage !== "splash") return;
    let seen = false;
    try { seen = sessionStorage.getItem("st-splash") === "1"; sessionStorage.setItem("st-splash", "1"); } catch {}
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (seen || reduce) { setStage("card"); return; }
    const t = setTimeout(() => setStage("card"), 1800);
    return () => clearTimeout(t);
  }, [stage]);

  return (
    <div className="lscreen" onClick={() => stage === "splash" && setStage("card")}>
      <Backdrop />
      {stage === "splash" ? (
        <>
          <img src="/brand-mark.svg" alt="MyAIO" className="splashlogo" width="132" height="80" />
          <button className="skip" onClick={() => setStage("card")}>Click anywhere to skip</button>
        </>
      ) : (
        <div className="lwrap"><div className="lcard">
          <img src="/brand-mark.svg" alt="MyAIO" className="lcardlogo" width="64" height="38" />
          <h1>SALES TARGET</h1>
          <p className="lsub">Sign-ups against target for the Lahore sales floor.</p>
          {notice && <div className={`lnotice ${noticeOk ? "ok" : ""}`} role="status">{notice}</div>}
          <a className="lbtn" href="/api/auth/login"><span className="lg">{G}</span>Continue with Google</a>
          <p className="lhint">Use the email an admin added for you</p>
          <p className="lfoot">Invited people only</p>
        </div></div>
      )}
    </div>
  );
}
