import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST(req) {
  const res = NextResponse.redirect(`${new URL(req.url).origin}/login?signed-out=1`, 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
