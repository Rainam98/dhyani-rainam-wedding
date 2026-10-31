"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE,
  SESSION_SECONDS,
  createSessionToken,
  getAdminConfig,
  passwordMatches,
} from "../../lib/admin/auth";

export type LoginState = { error: string | null };

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const config = getAdminConfig();
  if (!config) return { error: "Admin access is not configured on the server." };

  const attempt = formData.get("password");
  if (typeof attempt !== "string" || attempt.length > 200 || !passwordMatches(config, attempt)) {
    // Slow down password guessing.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { error: "Incorrect password." };
  }

  const store = await cookies();
  store.set(ADMIN_COOKIE, createSessionToken(config), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: SESSION_SECONDS,
  });
  redirect("/admin");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete({ name: ADMIN_COOKIE, path: "/admin" });
  redirect("/admin");
}
