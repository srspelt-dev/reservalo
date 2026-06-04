"use client";

import { useQuery } from "@tanstack/react-query";
import { api, ACCESS_KEY } from "@/lib/api";
import type { Tenant } from "@/lib/types";

export function useTenant() {
  return useQuery<Tenant>({
    queryKey: ["tenant"],
    queryFn: async () => (await api.get<Tenant>("/tenant")).data,
    enabled: typeof window !== "undefined" && !!localStorage.getItem(ACCESS_KEY),
    staleTime: 60_000,
  });
}
