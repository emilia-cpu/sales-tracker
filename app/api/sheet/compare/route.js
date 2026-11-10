import { NextResponse } from "next/server";
import { currentUser, isAdmin } from "@/lib/auth";
import { compareMonth, syncMonth, acceptSheet } from "@/lib/sheetsync";
import { driveConnection } from "@/lib/drive";
import { ptMonthTitle } from "@/lib/time";

export const dynamic = "force-dynamic";

// Admin: Settings → Compare with sheet. GET compares; POST { fix: "sheet" | "dashboard" } makes one match the other,
// then compares again. ?month= defaults to this month.
async function run(req, fix) {
  const user = await currentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Only admins can compare with the sheet." }, { status: 403 });
  if (!(await driveConnection().catch(() => null))) return NextResponse.json({ error: "Connect Google Drive first." }, { status: 400 });
  const month = new URL(req.url).searchParams.get("month") || ptMonthTitle();
  try {
    if (fix === "sheet") {
      const log = await syncMonth(month, user.email, { restore: true });
      if (!log.ok) return NextResponse.json({ error: log.error }, { status: 500 });
      if (log.busy) return NextResponse.json({ error: "The sheet is being updated right now. Try again in a few seconds." }, { status: 409 });
    } else if (fix === "dashboard") {
      await acceptSheet(month, user.email);
    }
    return NextResponse.json(await compareMonth(month));
  } catch (e) {
    return NextResponse.json({ error: e.message || "Couldn't read the sheet." }, { status: 500 });
  }
}

export const GET = (req) => run(req, null);
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  return run(req, b.fix === "dashboard" ? "dashboard" : "sheet");
}
