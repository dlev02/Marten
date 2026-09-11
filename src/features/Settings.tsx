import { lazy, useEffect } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import {
  Building2,
  Shapes,
  Store,
  Tags,
  SlidersHorizontal,
  Workflow,
  CircleHelp,
} from "lucide-react";
import { PageHeader } from "../components/folio/PageHeader";
import { Categories } from "./settings/Categories";
import { Merchants, TagSettings } from "./settings/Organization";
import { Rules } from "./settings/Rules";
import { Preferences } from "./settings/Preferences";
import { Institutions } from "./accounts/Institutions";
import "./settings.css";
const FAQ = lazy(() => import("./settings/FAQ"));
const sections = [
  { path: "categories", title: "Categories", icon: Shapes },
  { path: "merchants", title: "Merchants", icon: Store },
  { path: "rules", title: "Rules", icon: Workflow },
  { path: "tags", title: "Tags", icon: Tags },
  { path: "institutions", title: "Institutions", icon: Building2 },
  { path: "preferences", title: "Preferences", icon: SlidersHorizontal },
  { path: "faq", title: "Help & FAQ", icon: CircleHelp },
];
export function Settings({ onAddAccount }: { onAddAccount: () => void }) {
  const location = useLocation();
  useEffect(() => {
    if (!location.hash) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(location.hash.slice(1));
      if (!target) return;
      target.scrollIntoView({ block: "start", behavior: "instant" });
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, location.hash]);
  return (
    <div className="settings-page">
      <div className="settings-layout">
        <div className="settings-rail">
          <PageHeader title="Settings" />
          <nav className="settings-nav" aria-label="Settings sections">
            {sections.map((s) => (
              <NavLink
                key={s.path}
                to={`/settings/${s.path}`}
                className={({ isActive }) =>
                  `settings-nav-item ${isActive || (location.pathname === "/settings" && s.path === "categories") ? "active" : ""}`
                }
              >
                <s.icon size={17} />
                {s.title}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="settings-content">
          <Routes>
            <Route index element={<Categories />} />
            <Route path="categories" element={<Categories />} />
            <Route path="merchants" element={<Merchants />} />
            <Route path="rules" element={<Rules />} />
            <Route path="tags" element={<TagSettings />} />
            <Route
              path="institutions"
              element={<Institutions onAddAccount={onAddAccount} />}
            />
            <Route path="preferences" element={<Preferences />} />
            <Route path="faq" element={<FAQ />} />
            <Route path="*" element={<Categories />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
