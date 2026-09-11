import { useConvexAuth } from "convex/react";
import { DataProvider, useData } from "./lib/data";
import { Loading } from "./components/folio/ui";
import { AuthScreen, Onboarding } from "./features/Auth";
import { Shell } from "./features/Shell";
import { DemoStartup } from "./features/Demo";
import { isDemoSession } from "./lib/demo";
import { useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";
import { WebMCPProvider } from "./features/agents/WebMCPProvider";
const AgentAuthorize = lazy(() =>
  import("./features/agents/AgentAuthorize").then((module) => ({
    default: module.AgentAuthorize,
  })),
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
  if (isLoading) return <Loading />;
  return isAuthenticated ? (
    <DataProvider>
      <Workspace />
    </DataProvider>
  ) : isDemoSession() ? (
    <DemoStartup authenticated={false} />
  ) : (
    <AuthScreen />
  );
}
