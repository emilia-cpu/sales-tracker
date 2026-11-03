import { NextResponse } from "next/server";
import { currentUser, isAdmin } from "@/lib/auth";
import { disconnectDrive } from "@/lib/drive";

export async function POST(req) {
  const origin = new URL(req.url).origin;
  if (isAdmin(await currentUser())) await disconnectDrive();
  return NextResponse.redirect(`${origin}/settings?drive=disconnected`, 303);
}
