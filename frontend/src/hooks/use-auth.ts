"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api, ACCESS_KEY, clearTokens } from "@/lib/api";
import type { User } from "@/lib/types";

export function useCurrentUser() {
  return useQuery<User>({
    queryKey: ["me"],
    queryFn: async () => (await api.get<User>("/auth/me")).data,
    enabled: typeof window !== "undefined" && !!localStorage.getItem(ACCESS_KEY),
    retry: false,
  });
}

/** Redirects to /login when there is no session. Use on protected pages. */
export function useRequireAuth() {
  const router = useRouter();
  const query = useCurrentUser();

  useEffect(() => {
    const hasToken =
      typeof window !== "undefined" && !!localStorage.getItem(ACCESS_KEY);
    if (!hasToken || query.isError) {
      router.replace("/login");
    }
  }, [query.isError, router]);

  return query;
}

export async function logout() {
  // Best-effort server-side revocation, then clear local tokens.
  try {
    await api.post("/auth/logout");
  } catch {
    // ignore — we clear locally regardless
  }
  clearTokens();
  window.location.href = "/login";
}
