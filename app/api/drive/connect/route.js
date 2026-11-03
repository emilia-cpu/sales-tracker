import { NextResponse } from "next/server";
import { currentUser, isAdmin, googleConfigured } from "@/lib/auth";
import { driveAuthUrl } from "@/lib/drive";

// Admin: connect the sales file in Google Drive (Google consent with read-only Drive access).
export async function GET(req) {
  const origin = new URL(req.url).origin;
  const user = await currentUser();
  if (!isAdmin(user)) return NextResponse.redirect(`${origin}/`);
  if (!googleConfigured()) return NextResponse.redirect(`${origin}/settings?drive=failed&reason=${encodeURIComponent("Google sign-in keys aren't set on this app yet.")}`);
  const state = "drive:" + crypto.randomUUID();
  const res = NextResponse.redirect(driveAuthUrl(origin, state, user.email));
  res.cookies.set("st_drive_state", state, { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
