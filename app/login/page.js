import { redirect } from "next/navigation";
import { currentUser, googleConfigured } from "@/lib/auth";
import LoginScreen from "@/components/LoginScreen";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }) {
  if (await currentUser()) redirect("/");
  const sp = await searchParams;
  let notice = null, ok = false;
  if (sp.error === "invite") notice = `${sp.email || "This account"} doesn't have access yet. Ask an admin to add you in Settings → Team access, then sign in again.`;
  else if (sp.error === "failed") notice = `Sign-in didn't finish${sp.reason ? `: ${sp.reason}` : ""}. Please try again.`;
  else if (sp.error === "not-configured" || !googleConfigured()) notice = "Google sign-in isn't set up on this app yet.";
  else if (sp["signed-out"]) { notice = "You're signed out."; ok = true; }
  return <LoginScreen notice={notice} noticeOk={ok} skipSplash={!!notice} />;
}
