import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes (real-time push updates the cache)
      gcTime: 1000 * 60 * 15,    // 15 minutes
      refetchOnWindowFocus: false,
      retry: (failureCount, error: any) => {
        // Do not retry 401 or 403
        if (error?.status === 401 || error?.status === 403) return false;
        return failureCount < 2;
      },
    },
  },
});

export const queryKeys = {
  session: ["session"] as const,
  overview: ["overview"] as const,
  telemetry: ["telemetry"] as const,
  telemetryTimeseries: ["telemetry", "timeseries"] as const,
  alerts: ["alerts"] as const,
  alert: (id: string) => ["alerts", id] as const,
  identities: ["identities"] as const,
  identity: (id: string) => ["identities", id] as const,
  history: ["history"] as const,
  scenarios: ["scenarios"] as const,
  models: ["models"] as const,
  systemHealth: ["system", "health"] as const,
  logs: (limit?: number) => ["logs", limit || 50] as const,
};
