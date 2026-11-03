import { NextResponse } from "next/server";
import { currentUser, isAdmin } from "@/lib/auth";
import { syncMonth } from "@/lib/sheetsync";
import { ptMonthTitle } from "@/lib/time";

// Admin: Settings → "Write to sheet now" for this month.
export async function POST(req) {
  const origin = new URL(req.url).origin;
  const user = await currentUser();
  if (!isAdmin(user)) return NextResponse.redirect(`${origin}/`, 303);
  const log = await syncMonth(ptMonthTitle(), user.email);
  return NextResponse.redirect(`${origin}/settings?synced=${log.ok ? "1" : "0"}`, 303);
}
