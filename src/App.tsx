import { useConvexAuth } from "convex/react";
import { DataProvider, useData } from "./lib/data";
import { Loading } from "./components/folio/ui";
import { AuthScreen, Onboarding } from "./features/Auth";
import { Shell } from "./features/Shell";
import { DemoStartup } from "./features/Demo";
import { isDemoSession } from "./lib/demo";
function Workspace() {
  const data = useData();
  return data.profile ? (
    <Shell />
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
