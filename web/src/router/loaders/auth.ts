import { redirect } from "react-router-dom";
import { ensureAuthReady, getCurrentUser } from "../../lib/auth";

export async function requireAuth() {
  await ensureAuthReady();
  const user = getCurrentUser();
  if (!user) throw redirect("/?login=1");
  return user;
}
