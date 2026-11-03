import { NextResponse, after } from "next/server";
import { syncMonth, markDirty } from "@/lib/sheetsync";
import { currentUser, isAdmin } from "@/lib/auth";
import { getEntry, removeEntry, isLogMonth } from "@/lib/entries";

// Remove a logged sign-up (a mistake or a duplicate). Only the person who logged it, or an admin.
export async function DELETE(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  const title = new URL(req.url).searchParams.get("m") || "";
  if (!isLogMonth(title)) return NextResponse.json({ error: "Unknown month." }, { status: 400 });
  const e = await getEntry(title, id);
  if (!e) return NextResponse.json({ error: "Already removed." }, { status: 404 });
  if (e.by !== user.email && !isAdmin(user)) return NextResponse.json({ error: "Only the person who logged it or an admin can remove it." }, { status: 403 });
  await removeEntry(title, id);
  await markDirty(title);
  after(() => syncMonth(title, user.email));
  return NextResponse.json({ ok: true });
}
