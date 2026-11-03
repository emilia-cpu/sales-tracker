import { NextResponse } from "next/server";
import { currentUser, isAdmin } from "@/lib/auth";
import { listPeople, setPerson, removePerson, fixedAdmins, cleanEmail, validEmail } from "@/lib/people";

// Admin: Team access. { action: "add" | "role" | "remove", email, role? }
export async function POST(req) {
  const user = await currentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Only admins can change access." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const email = cleanEmail(b.email);
  const role = b.role === "admin" ? "admin" : "user";
  if (!validEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (fixedAdmins().includes(email)) return NextResponse.json({ error: `${email} is always an admin.` }, { status: 400 });
  const people = await listPeople();

  if (b.action === "add") {
    if (people[email]) return NextResponse.json({ error: `${email} already has access.` }, { status: 400 });
    await setPerson(email, role, user.email);
  } else if (b.action === "role") {
    if (!people[email]) return NextResponse.json({ error: `${email} isn't on the list.` }, { status: 400 });
    if (email === user.email && role !== "admin") return NextResponse.json({ error: "You can't remove your own admin access." }, { status: 400 });
    await setPerson(email, role, user.email);
  } else if (b.action === "remove") {
    if (email === user.email) return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 });
    await removePerson(email);
  } else {
    return NextResponse.json({ error: "Unknown change." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
