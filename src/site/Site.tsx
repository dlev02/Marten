import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import "@fontsource-variable/bricolage-grotesque";
import "./site.css";
import { Loading } from "../components/folio/ui";
import { DocumentPage } from "./DocumentPage";
import { FaqPage } from "./FaqPage";
import { privacyPolicy } from "./content/privacy";
import { termsOfService } from "./content/terms";
import { securityOverview } from "./content/security";
import { aboutStory } from "./content/about";
const Landing = lazy(() =>
  import("./Landing").then((module) => ({ default: module.Landing })),
);
const SupportPage = lazy(() =>
  import("./SupportPage").then((module) => ({ default: module.SupportPage })),
);

export function Site() {
  const { pathname } = useLocation();
  const page = (() => {
    switch (pathname) {
      case "/faq":
        return <FaqPage />;
      case "/privacy":
        return <DocumentPage document={privacyPolicy} />;
      case "/terms":
        return <DocumentPage document={termsOfService} />;
      case "/security":
        return <DocumentPage document={securityOverview} />;
      case "/about":
        return <DocumentPage document={aboutStory} />;
      case "/support":
        return <SupportPage />;
      default:
        return <Landing />;
    }
  })();
  return <Suspense fallback={<Loading full />}>{page}</Suspense>;
}
