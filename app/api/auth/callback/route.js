import { NextResponse } from "next/server";
import { finishLogin, SESSION_COOKIE, currentUser, isAdmin } from "@/lib/auth";
import { finishDriveConnect } from "@/lib/drive";

export async function GET(req) {
  const url = new URL(req.url);
  // Admin connecting the Drive file (same return address as sign-in).
  if (String(url.searchParams.get("state") || "").startsWith("drive:")) {
    const ok = req.cookies.get("st_drive_state")?.value === url.searchParams.get("state") && url.searchParams.get("code");
    const user = await currentUser();
    let q = "drive=failed&reason=" + encodeURIComponent("Connection didn't finish. Try again.");
    if (ok && isAdmin(user)) {
      try { await finishDriveConnect(url.origin, url.searchParams.get("code"), user.email); q = "drive=connected"; }
      catch (e) { q = "drive=failed&reason=" + encodeURIComponent(e.message); }
    }
    const res = NextResponse.redirect(`${url.origin}/settings?${q}`);
    res.cookies.delete("st_drive_state");
    return res;
  }
  const state = req.cookies.get("st_state")?.value;
  if (!state || state !== url.searchParams.get("state") || !url.searchParams.get("code")) {
    return NextResponse.redirect(`${url.origin}/login?error=failed`);
  }
  let session;
  try {
    session = await finishLogin(url.origin, url.searchParams.get("code"));
  } catch (e) {
    const res = NextResponse.redirect(`${url.origin}/login?error=${e.code === "invite" ? `invite&email=${encodeURIComponent(e.email)}` : `failed&reason=${encodeURIComponent(e.message)}`}`);
    res.cookies.delete("st_state");
    return res;
  }
  const res = NextResponse.redirect(`${url.origin}/`);
  res.cookies.delete("st_state");
  res.cookies.set(SESSION_COOKIE, session, { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/" });
  return res;
}
