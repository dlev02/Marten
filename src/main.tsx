import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache/provider";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ToastProvider } from "./components/folio/ui";
import App from "./App";
import { RouteErrorScreen } from "./components/folio/RouteErrorBoundary";
import { reloadForStaleChunk } from "./lib/staleChunk";
import {
  applyFont,
  readFont,
  applyCategoryIconStyle,
  readCategoryIconStyle,
} from "./lib/appearance";
import { initializeDemoContext } from "./lib/demo";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "./index.css";
const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!url) throw new Error("Set VITE_CONVEX_URL in .env.local to start Marten.");
const convex = new ConvexReactClient(url);
const demo = initializeDemoContext();
applyFont(readFont());
applyCategoryIconStyle(readCategoryIconStyle());
// After a deploy, an old tab can request chunks that no longer exist.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForStaleChunk()) event.preventDefault();
});
const router = createBrowserRouter([
  { path: "*", element: <App />, errorElement: <RouteErrorScreen /> },
]);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ConvexAuthProvider
        client={convex}
        {...(demo.active
          ? {
              storage: demo.storage ?? {
                getItem: () => null,
                setItem: () => {},
                removeItem: () => {},
              },
              storageNamespace: `folio-demo-${url}`,
              shouldHandleCode: false,
            }
          : {})}
      >
        {/* Keeps recently used subscriptions alive so returning to a page
            reuses them instead of re-reading every row from the database. */}
        <ConvexQueryCacheProvider expiration={10 * 60_000}>
          <Tooltip.Provider delayDuration={350}>
            <ToastProvider>
              <RouterProvider router={router} />
            </ToastProvider>
          </Tooltip.Provider>
        </ConvexQueryCacheProvider>
      </ConvexAuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
