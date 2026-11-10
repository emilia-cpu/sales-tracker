import { NextResponse } from "next/server";
import { currentUser, isAdmin } from "@/lib/auth";
import { sheetHistory } from "@/lib/history";
import { deltaFrom } from "@/lib/sheetsync";
import { ptMonthTitle } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // downloads many versions of a 7 MB file

// Admin: Settings → Compare → Check earlier versions. ?month= defaults to this month.
export async function GET(req) {
  const user = await currentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Only admins can check earlier versions." }, { status: 403 });
  const month = new URL(req.url).searchParams.get("month") || ptMonthTitle();
  try {
    // A few minutes past the switch, so the first adding write is included too.
    const until = new Date(Date.parse(await deltaFrom()) + 10 * 60000).toISOString();
    return NextResponse.json(await sheetHistory(month, until));
  } catch (e) {
    return NextResponse.json({ error: e.message || "Couldn't read the earlier versions." }, { status: 500 });
  }
}
