"use client";

import { useQuery } from "@tanstack/react-query";
import { api, ACCESS_KEY } from "@/lib/api";
import type { Subscription } from "@/lib/types";

export function useSubscription() {
  return useQuery<Subscription>({
    queryKey: ["subscription"],
    queryFn: async () => (await api.get<Subscription>("/subscription")).data,
    enabled: typeof window !== "undefined" && !!localStorage.getItem(ACCESS_KEY),
    staleTime: 60_000,
  });
}
