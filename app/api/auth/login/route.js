import { NextResponse } from "next/server";
import { authUrl, googleConfigured } from "@/lib/auth";

export async function GET(req) {
  const origin = new URL(req.url).origin;
  if (!googleConfigured()) return NextResponse.redirect(`${origin}/login?error=not-configured`);
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authUrl(origin, state));
  res.cookies.set("st_state", state, { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
