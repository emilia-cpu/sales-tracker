import { NextResponse } from "next/server";
import { currentUser, isAdmin } from "@/lib/auth";
import { compareMonth, syncMonth } from "@/lib/sheetsync";
import { driveConnection } from "@/lib/drive";
import { ptMonthTitle } from "@/lib/time";

export const dynamic = "force-dynamic";

// Admin: Settings → Compare now (GET) and Make the sheet match (POST, then compares again). ?month= defaults to this month.
async function run(req, fix) {
  const user = await currentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Only admins can compare with the sheet." }, { status: 403 });
  if (!(await driveConnection().catch(() => null))) return NextResponse.json({ error: "Connect Google Drive first." }, { status: 400 });
  const month = new URL(req.url).searchParams.get("month") || ptMonthTitle();
  try {
    if (fix) {
      const log = await syncMonth(month, user.email);
      if (!log.ok) return NextResponse.json({ error: log.error }, { status: 500 });
    }
    return NextResponse.json(await compareMonth(month));
  } catch (e) {
    return NextResponse.json({ error: e.message || "Couldn't read the sheet." }, { status: 500 });
  }
}

export const GET = (req) => run(req, false);
export const POST = (req) => run(req, true);
