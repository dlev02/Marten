import { useConvexAuth } from "convex/react";
import { DataProvider, useData } from "./lib/data";
import { Loading } from "./components/folio/ui";
import { AuthScreen, Onboarding } from "./features/Auth";
import { Shell } from "./features/Shell";
import { DemoStartup } from "./features/Demo";
import { demoLoadingText, isDemoSession } from "./lib/demo";
import { Navigate, useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";
import { publicPaths, visitorOnlyPaths } from "./site/paths";
import { WebMCPProvider } from "./features/agents/WebMCPProvider";
const AgentAuthorize = lazy(() =>
  import("./features/agents/AgentAuthorize").then((module) => ({
    default: module.AgentAuthorize,
  })),
);
const Site = lazy(() =>
  import("./site/Site").then((module) => ({ default: module.Site })),
);
function Workspace() {
  const data = useData();
  const location = useLocation();
  return data.profile ? (
    location.pathname === "/agent-authorize" ? (
      <Suspense fallback={<Loading />}>
        <AgentAuthorize />
      </Suspense>
    ) : (
      <WebMCPProvider>
        <Shell />
      </WebMCPProvider>
    )
  ) : isDemoSession() ? (
    <DemoStartup authenticated />
  ) : (
    <Onboarding />
  );
}
export default function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { pathname } = useLocation();
  // The marketing and policy pages render for everyone, signed in or not.
  if (publicPaths.has(pathname))
    return (
      <Suspense fallback={<Loading full />}>
        <Site />
      </Suspense>
    );
  if (isLoading)
    return (
      <Loading full text={isDemoSession() ? demoLoadingText : undefined} />
    );
  if (isAuthenticated) {
    if (pathname === "/sign-in") return <Navigate to="/dashboard" replace />;
    return (
      <DataProvider>
        <Workspace />
      </DataProvider>
    );
  }
  if (isDemoSession()) return <DemoStartup authenticated={false} />;
  if (visitorOnlyPaths.has(pathname))
    return (
      <Suspense fallback={<Loading full />}>
        <Site />
      </Suspense>
    );
  return <AuthScreen />;
}
