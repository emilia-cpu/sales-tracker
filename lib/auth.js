// Login: "Continue with Google". Only email + name are requested, and only people on the Team access list
// (lib/people.js) get in. The session is a signed cookie: email, name and expiry, signed with SESSION_SECRET.
// The role is looked up on every request, so removing someone or changing their role applies right away.
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { roleOf, noteSignIn } from "@/lib/people";

export const SESSION_COOKIE = "st_session";
const SESSION_DAYS = 30;

// Trimmed: values pasted into Vercel often carry a stray space or line break, which Google rejects.
const CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || "").trim();
const CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
// Signs session cookies. SESSION_SECRET if set, otherwise derived from the Google client secret (server-only too).
const SECRET = (process.env.SESSION_SECRET || "").trim() || (CLIENT_SECRET ? createHmac("sha256", CLIENT_SECRET).update("sales-target-session").digest("hex") : "");

export const googleConfigured = () => !!(CLIENT_ID && CLIENT_SECRET && SECRET);
export const redirectUri = (origin) => `${origin}/api/auth/callback`;

export function authUrl(origin, state) {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

const sign = (body) => createHmac("sha256", SECRET).update(body).digest("base64url");

function seal(data) {
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function unseal(value) {
  const [body, sig] = String(value || "").split(".");
  if (!body || !sig || !SECRET) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return null; }
}

// Exchanges Google's code for the person's verified email. Returns the cookie value for the session.
export async function finishLogin(origin, code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(origin),
    }),
    cache: "no-store",
  });
  const t = await res.json();
  if (!res.ok) throw new Error(t.error_description || t.error || `Google sign-in error ${res.status}`);
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json());
  const email = String(info.email || "").toLowerCase();
  if (!email || info.email_verified === false) throw Object.assign(new Error("Google didn't confirm this email."), { code: "failed" });
  if (!(await roleOf(email))) throw Object.assign(new Error(`${email} hasn't been given access yet.`), { code: "invite", email });
  await noteSignIn(email, info.name);
  return seal({ email, name: info.name || null, exp: Date.now() + SESSION_DAYS * 864e5 });
}

// Admins see Settings: the sheet connection, Teams & agents and Team access.
export const isAdmin = (user) => user?.role === "admin";

// The signed-in person ({ email, name, role }) or null, also when they've since been removed from Team access.
export async function currentUser() {
  let s;
  // Local development without Google: DEV_LOGIN_EMAIL=you@myaio.com npm run dev
  if (process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN_EMAIL) s = { email: process.env.DEV_LOGIN_EMAIL.toLowerCase(), name: null, exp: Infinity };
  else s = unseal((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s?.email || !(s.exp > Date.now())) return null;
  const role = await roleOf(s.email);
  return role ? { email: s.email, name: s.name, role } : null;
}
