import { redirect } from "next/navigation";
import { currentUser, googleConfigured, ALLOWED_DOMAIN } from "@/lib/auth";
import LoginScreen from "@/components/LoginScreen";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }) {
  if (await currentUser()) redirect("/");
  const sp = await searchParams;
  let notice = null, ok = false;
  if (sp.error === "domain") notice = `That account isn't a MyAIO work account. Sign in with your @${ALLOWED_DOMAIN} email.`;
  else if (sp.error === "failed") notice = `Sign-in didn't finish${sp.reason ? `: ${sp.reason}` : ""}. Please try again.`;
  else if (sp.error === "not-configured" || !googleConfigured()) notice = "Google sign-in isn't set up on this app yet.";
  else if (sp["signed-out"]) { notice = "You're signed out."; ok = true; }
  return <LoginScreen notice={notice} noticeOk={ok} domain={ALLOWED_DOMAIN} skipSplash={!!notice} />;
}
