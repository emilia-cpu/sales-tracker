// Who may use Sales Target (Settings → Team access): each email is a "user" (dashboard + Log a sign-up) or an
// "admin" (also Settings). Only people on this list can sign in. The owner (FOUNDING_ADMIN) and anyone in
// ADMIN_EMAILS are always admins and can't be removed here.
import { hGet, hSet } from "@/lib/store";

export const FOUNDING_ADMIN = "emilia@myaio.com";
const KEY = "st:settings";
const FIELD = "people";

export const fixedAdmins = () => [...new Set([FOUNDING_ADMIN, ...(process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)])];
export const cleanEmail = (e) => String(e || "").trim().toLowerCase();
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// { email: { role: "admin" | "user", by, at, name?, lastSeen? } }
export async function listPeople() {
  return (await hGet(KEY, FIELD).catch(() => null)) || {};
}

async function save(people) {
  await hSet(KEY, FIELD, people);
}

// "admin", "user", or null (not allowed in).
export async function roleOf(email) {
  email = cleanEmail(email);
  if (!email) return null;
  if (fixedAdmins().includes(email)) return "admin";
  return (await listPeople())[email]?.role || null;
}

export async function setPerson(email, role, by) {
  const people = await listPeople();
  people[email] = { ...(people[email] || { by, at: new Date().toISOString() }), role };
  await save(people);
}

export async function removePerson(email) {
  const people = await listPeople();
  delete people[email];
  await save(people);
}

// Remembered at sign-in so Team access can show names and when each person last signed in.
export async function noteSignIn(email, name) {
  const people = await listPeople();
  if (!people[email] && !fixedAdmins().includes(email)) return;
  people[email] = { ...(people[email] || { role: "admin" }), name: name || people[email]?.name || null, lastSeen: new Date().toISOString() };
  await save(people).catch(() => {}); // never block sign-in over this
}
