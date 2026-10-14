import React, { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/realtime/queryClient";
import { AppLayout } from "@/components/layout/AppLayout";
import { Skeleton } from "@/design/components/Skeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { api } from "@/lib/api";

// Lazy load route screens for route-level code splitting (budget <= 250KB gzipped)
const Landing = lazy(() => import("@/features/landing/LandingPage"));
const DesignSystemPreview = lazy(() => import("@/pages/DesignSystemPreview"));

const OverviewPage = lazy(() => import("@/features/overview/OverviewPage"));
const AlertsPage = lazy(() => import("@/features/alerts/AlertsPage"));
const AttackConsolePage = lazy(() => import("@/features/attack/AttackConsolePage"));
const ModelsPage = lazy(() => import("@/features/models/ModelsPage"));
const AnalyticsPage = lazy(() => import("@/features/analytics/AnalyticsPage"));
const IdentityDrilldownPage = lazy(() => import("@/features/identities/IdentityDrilldownPage"));
const SettingsPage = lazy(() => import("@/features/settings/SettingsPage"));
const ParticipantPage = lazy(() => import("@/features/participant/ParticipantPage"));

// Auxiliary routes for backwards compatibility
const TopologyRoute = lazy(() =>
  import("@/routes/pageWrappers").then((m) => ({ default: m.TopologyRoute }))
);
const HistoryRoute = lazy(() =>
  import("@/routes/pageWrappers").then((m) => ({ default: m.HistoryRoute }))
);
const LiveMonitorRoute = lazy(() =>
  import("@/routes/pageWrappers").then((m) => ({ default: m.LiveMonitorRoute }))
);

const RouteLoadingFallback = () => (
  <div className="p-6 md:p-8 space-y-5 max-w-5xl mx-auto">
    <div className="space-y-2">
      <Skeleton height={28} width="35%" />
      <Skeleton height={16} width="55%" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
      <Skeleton height={96} />
      <Skeleton height={96} />
      <Skeleton height={96} />
      <Skeleton height={96} />
    </div>
    <Skeleton height={320} className="rounded-xl mt-4" />
  </div>
);

function LandingRoute() {
  return <Landing />;
}

// Redirects legacy hash urls (e.g. #/alerts or #alerts) to clean React Router paths
function HashRedirectWatcher() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace(/^#\/?/, "");
      if (hash) {
        const routeMap: Record<string, string> = {
          command: "/overview",
          overview: "/overview",
          alerts: "/alerts",
          attack: "/attack-console",
          "attack-console": "/attack-console",
          model: "/models",
          models: "/models",
          analytics: "/analytics",
          devices: "/devices",
          topology: "/topology",
          settings: "/settings",
          targets: "/settings",
          history: "/history",
          live: "/live",
          join: "/join",
          participant: "/join",
          design: "/design",
        };
        if (routeMap[hash]) {
          navigate(routeMap[hash], { replace: true });
        }
      }
    };

    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [navigate]);

  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <HashRedirectWatcher />
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              {/* Public Landing Screen */}
              <Route path="/" element={<LandingRoute />} />

              {/* Participant Portal */}
              <Route path="/join" element={<ParticipantPage />} />
              <Route path="/participant" element={<Navigate to="/join" replace />} />

              {/* Main Operator Shell */}
              <Route element={<AppLayout />}>
                <Route path="/overview" element={<OverviewPage />} />
                <Route path="/alerts" element={<AlertsPage />} />
                <Route path="/alerts/:id" element={<AlertsPage />} />
                <Route path="/attack-console" element={<AttackConsolePage />} />
                <Route path="/attack" element={<Navigate to="/attack-console" replace />} />
                <Route path="/models" element={<ModelsPage />} />
                <Route path="/model" element={<Navigate to="/models" replace />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/devices" element={<IdentityDrilldownPage />} />
                <Route path="/devices/:id" element={<IdentityDrilldownPage />} />
                <Route path="/identities" element={<Navigate to="/devices" replace />} />
                <Route path="/identities/:id" element={<IdentityDrilldownPage />} />
                <Route path="/topology" element={<TopologyRoute />} />
                <Route path="/live" element={<LiveMonitorRoute />} />
                <Route path="/history" element={<HistoryRoute />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/targets" element={<Navigate to="/settings" replace />} />
                <Route path="/design" element={<DesignSystemPreview />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/overview" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
