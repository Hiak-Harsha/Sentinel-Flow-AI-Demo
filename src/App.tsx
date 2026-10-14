import React, { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/realtime/queryClient";
import { AppLayout } from "@/components/layout/AppLayout";
import { Skeleton } from "@/design/components/Skeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { api } from "@/lib/api";

// Lazy load route screens for route-level code splitting (budget <= 250KB gzipped)
const Landing = lazy(() =>
  import("@/pages/Landing").then((m) => ({ default: m.Landing || m.default }))
);
const DesignSystemPreview = lazy(() => import("@/pages/DesignSystemPreview"));

const OverviewRoute = lazy(() =>
  import("@/routes/pageWrappers").then((m) => ({ default: m.OverviewRoute }))
);
const AlertsRoute = lazy(() =>
  import("@/routes/pageWrappers").then((m) => ({ default: m.AlertsRoute }))
);
const AttackConsoleRoute = lazy(() =>
  import("@/routes/pageWrappers").then((m) => ({ default: m.AttackConsoleRoute }))
);
const ModelRoute = lazy(() =>
  import("@/routes/pageWrappers").then((m) => ({ default: m.ModelRoute }))
);
const AnalyticsRoute = lazy(() =>
  import("@/routes/pageWrappers").then((m) => ({ default: m.AnalyticsRoute }))
);
const DevicesRoute = lazy(() =>
  import("@/routes/pageWrappers").then((m) => ({ default: m.DevicesRoute }))
);
const TopologyRoute = lazy(() =>
  import("@/routes/pageWrappers").then((m) => ({ default: m.TopologyRoute }))
);
const SettingsRoute = lazy(() =>
  import("@/routes/pageWrappers").then((m) => ({ default: m.SettingsRoute }))
);
const ParticipantRoute = lazy(() =>
  import("@/routes/pageWrappers").then((m) => ({ default: m.ParticipantRoute }))
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
  const navigate = useNavigate();

  const handleSelectRole = (selectedRole: string) => {
    if (selectedRole === "participant") {
      sessionStorage.setItem("sf_role", "participant");
      navigate("/join");
    } else {
      sessionStorage.setItem("sf_role", "operator");
      navigate("/overview");
    }
  };

  const handleOperatorLogin = async (passcode: string) => {
    const res = await api.loginOperator(passcode);
    sessionStorage.setItem("sf_role", "operator");
    if (res?.token) {
      sessionStorage.setItem("sf_session_token", res.token);
    }
    navigate("/overview");
  };

  return (
    <div className="min-h-screen bg-[#060b13] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-white">
      <main className="flex-1 flex items-center justify-center">
        <Landing
          onSelectRole={handleSelectRole}
          onOperatorLogin={handleOperatorLogin}
        />
      </main>
    </div>
  );
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
              <Route path="/join" element={<ParticipantRoute />} />
              <Route path="/participant" element={<Navigate to="/join" replace />} />

              {/* Main Operator Shell */}
              <Route element={<AppLayout />}>
                <Route path="/overview" element={<OverviewRoute />} />
                <Route path="/alerts" element={<AlertsRoute />} />
                <Route path="/alerts/:id" element={<AlertsRoute />} />
                <Route path="/attack-console" element={<AttackConsoleRoute />} />
                <Route path="/attack" element={<Navigate to="/attack-console" replace />} />
                <Route path="/models" element={<ModelRoute />} />
                <Route path="/model" element={<Navigate to="/models" replace />} />
                <Route path="/analytics" element={<AnalyticsRoute />} />
                <Route path="/devices" element={<DevicesRoute />} />
                <Route path="/devices/:id" element={<DevicesRoute />} />
                <Route path="/identities" element={<Navigate to="/devices" replace />} />
                <Route path="/identities/:id" element={<DevicesRoute />} />
                <Route path="/topology" element={<TopologyRoute />} />
                <Route path="/live" element={<LiveMonitorRoute />} />
                <Route path="/history" element={<HistoryRoute />} />
                <Route path="/settings" element={<SettingsRoute />} />
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
