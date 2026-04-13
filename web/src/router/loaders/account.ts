import { requireAuth } from "./auth";

export async function requireAuthLoader() {
  return { user: await requireAuth() };
}
