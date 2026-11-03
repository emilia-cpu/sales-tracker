// Login: "Continue with Google" with a work email. Only email + name are requested.
// The session is a signed cookie (no database): email, name and expiry, signed with SESSION_SECRET.
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "st_session";
export const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN || "myaio.com").toLowerCase();
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
    hd: ALLOWED_DOMAIN,
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
  if (!email.endsWith("@" + ALLOWED_DOMAIN)) throw Object.assign(new Error(`Use your @${ALLOWED_DOMAIN} work email.`), { code: "domain" });
  return seal({ email, name: info.name || null, exp: Date.now() + SESSION_DAYS * 864e5 });
}

// Admins connect the Drive file in Settings: the founding admin plus anyone listed in ADMIN_EMAILS (comma-separated).
export const FOUNDING_ADMIN = "emilia@myaio.com";
export const isAdmin = (user) =>
  !!user?.email && [FOUNDING_ADMIN, ...(process.env.ADMIN_EMAILS || "").split(",")].map((e) => e.trim().toLowerCase()).includes(user.email);

// The signed-in person ({ email, name }) or null.
export async function currentUser() {
  // Local development without Google: DEV_LOGIN_EMAIL=you@myaio.com npm run dev
  if (process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN_EMAIL) return { email: process.env.DEV_LOGIN_EMAIL.toLowerCase(), name: null };
  const s = unseal((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s?.email || !(s.exp > Date.now()) || !s.email.endsWith("@" + ALLOWED_DOMAIN)) return null;
  return { email: s.email, name: s.name };
}
