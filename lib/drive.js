// Live data: the "Lahore Sales Target.xlsx" file in Google Drive, read as it is (no conversion to Google Sheets).
// The admin connects once in Settings (Google consent, read-only Drive). The app then checks the file's
// "last modified" time and downloads it again only when someone has edited it.
import { hGet, hSet } from "@/lib/store";
import { readWorkbook } from "@/lib/xlsx";

export const FILE_ID = (process.env.SALES_FILE_ID || "1CAxFf_QsFxhjEovnDdSG0jTSnrU92J_w").trim();
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const SETTINGS = "st:settings";
const CHECK_EVERY = 30000; // ms between "has the file changed?" checks

const CLIENT_ID = () => (process.env.GOOGLE_CLIENT_ID || "").trim();
const CLIENT_SECRET = () => (process.env.GOOGLE_CLIENT_SECRET || "").trim();

export async function driveConnection() {
  return (await hGet(SETTINGS, "drive")) || null;
}

export function driveAuthUrl(origin, state, email) {
  const p = new URLSearchParams({
    client_id: CLIENT_ID(),
    redirect_uri: `${origin}/api/auth/callback`,
    response_type: "code",
    scope: `openid email ${DRIVE_SCOPE}`,
    access_type: "offline",
    prompt: "consent",
    login_hint: email,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function finishDriveConnect(origin, code, email) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID(), client_secret: CLIENT_SECRET(), code, grant_type: "authorization_code", redirect_uri: `${origin}/api/auth/callback` }),
    cache: "no-store",
  });
  const t = await res.json();
  if (!res.ok) throw new Error(t.error_description || t.error || `Google error ${res.status}`);
  if (!t.refresh_token) throw new Error("Google didn't return a lasting connection. Try again.");
  if (!String(t.scope || "").includes(DRIVE_SCOPE)) throw new Error("Drive access wasn't allowed. Tick the Drive box on Google's screen.");
  await hSet(SETTINGS, "drive", { refreshToken: t.refresh_token, token: t.access_token, exp: Date.now() + (t.expires_in || 3600) * 1000, by: email, at: new Date().toISOString() });
  cache = null;
}

export async function disconnectDrive() {
  await hSet(SETTINGS, "drive", null);
  cache = null;
}

async function accessToken() {
  const conn = await driveConnection();
  if (!conn?.refreshToken) throw Object.assign(new Error("Google Drive isn't connected"), { code: "not-connected" });
  if (conn.token && conn.exp > Date.now() + 60000) return conn.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID(), client_secret: CLIENT_SECRET(), refresh_token: conn.refreshToken, grant_type: "refresh_token" }),
    cache: "no-store",
  });
  const t = await res.json();
  if (!res.ok) throw new Error(t.error === "invalid_grant" ? "The Google Drive connection expired. Reconnect it in Settings." : t.error_description || t.error || `Google error ${res.status}`);
  await hSet(SETTINGS, "drive", { ...conn, token: t.access_token, exp: Date.now() + (t.expires_in || 3600) * 1000 });
  return t.access_token;
}

async function drive(query, as = "json") {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${FILE_ID}?supportsAllDrives=true&${query}`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(res.status === 404 ? "The sales file wasn't found, or the connected account can't open it." : j.error?.message || `Google Drive error ${res.status}`);
  }
  return as === "json" ? res.json() : res.arrayBuffer();
}

// Kept per server instance: the last file read, and when it was last checked.
let cache = null;

// { tabs, updated, name } from the Drive file. Throws when not connected or Google refuses.
// If Google fails after an earlier good read, that read is returned with the error so the dashboard keeps working.
export async function readDriveTabs() {
  if (cache && Date.now() - cache.checked < CHECK_EVERY) return cache;
  try {
    const meta = await drive("fields=name,modifiedTime,mimeType");
    if (cache && cache.updated === meta.modifiedTime) {
      cache = { ...cache, checked: Date.now(), error: null };
      return cache;
    }
    const tabs = readWorkbook(await drive("alt=media", "buffer"));
    if (!Object.keys(tabs).length) throw new Error("No month tabs in the sign-up layout were found in the file.");
    cache = { tabs, updated: meta.modifiedTime, name: meta.name, checked: Date.now(), error: null };
    return cache;
  } catch (e) {
    if (!cache) throw e;
    cache = { ...cache, checked: Date.now(), error: e.message };
    return cache;
  }
}
