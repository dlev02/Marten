import { lazy, Suspense, useEffect, useState, type ReactElement } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useAuthActions } from "@convex-dev/auth/react";
import { useTheme } from "next-themes";
import { useAmountsHidden, setAmountsHidden } from "../lib/amountVisibility";
import {
  BarChart3,
  ChartNoAxesCombined,
  CalendarDays,
  ChevronDown,
  Home,
  List,
  LogOut,
  Menu,
  PanelLeft,
  CircleHelp,
  Moon,
  PieChart,
  Search,
  Settings2,
  Sparkles,
  Sun,
  TrendingUp,
  WalletCards,
  X,
  ExternalLink,
  Gauge,
  Heart,
  MessageSquare,
  Eye,
  EyeOff,
} from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useSidebarLabels } from "../lib/sidebarLabels";
import * as Popover from "@radix-ui/react-popover";
import * as Dialog from "@radix-ui/react-dialog";
import { profileAvatarUrl } from "../lib/profileAvatar";
import { transitionAppearance } from "../lib/appearance";
import { useData } from "../lib/data";
import { Avatar, Loading, IconButton, useTask } from "../components/folio/ui";
import { Brand } from "./Auth";
import { GlobalSearch } from "./search/GlobalSearch";
import { DemoBanner } from "./Demo";
import { ReminderDispatcher } from "./ReminderDispatcher";
import { exitDemo, isDemoSession } from "../lib/demo";
import { RouteErrorBoundary } from "../components/folio/RouteErrorBoundary";
import { FeedbackDialog } from "./Feedback";
const Dashboard = lazy(() =>
  import("./Dashboard").then((module) => ({ default: module.Dashboard })),
);
const Accounts = lazy(() =>
  import("./Accounts").then((module) => ({ default: module.Accounts })),
);
const Transactions = lazy(() =>
  import("./Transactions").then((module) => ({ default: module.Transactions })),
);
const CashFlow = lazy(() =>
  import("./Reports").then((module) => ({ default: module.CashFlow })),
);
const Reports = lazy(() =>
  import("./Reports").then((module) => ({ default: module.Reports })),
);
const Recurring = lazy(() =>
  import("./Recurring").then((module) => ({ default: module.Recurring })),
);
const Investments = lazy(() =>
  import("./Investments").then((module) => ({ default: module.Investments })),
);
const Forecast = lazy(() =>
  import("./Forecast").then((module) => ({ default: module.Forecast })),
);
const CreditScores = lazy(() =>
  import("./CreditScores").then((module) => ({ default: module.CreditScores })),
);
const Settings = lazy(() =>
  import("./Settings").then((module) => ({ default: module.Settings })),
);
const Support = lazy(() =>
  import("./Support").then((module) => ({ default: module.Support })),
);
import { AddAccount } from "./accounts/AddAccount";
import { PlaidLinkFlow } from "./accounts/PlaidLinkFlow";
const nav = [
  { path: "/dashboard", label: "Dashboard", icon: Home },
  { path: "/accounts", label: "Accounts", icon: WalletCards },
  { path: "/transactions", label: "Transactions", icon: List },
  { path: "/cash-flow", label: "Cash Flow", icon: BarChart3 },
  { path: "/reports", label: "Reports", icon: PieChart },
  { path: "/recurring", label: "Recurring", icon: CalendarDays },
  { path: "/investments", label: "Investments", icon: ChartNoAxesCombined },
  { path: "/forecast", label: "Forecast", icon: TrendingUp },
  { path: "/credit-scores", label: "Credit scores", icon: Gauge },
];
export function Shell() {
  const location = useLocation();
  const [mobile, setMobile] = useState(false),
    [search, setSearch] = useState(false),
    [account, setAccount] = useState(false),
    [feedback, setFeedback] = useState(false),
    [collapsed, setCollapsed] = useState(() => {
      try {
        return localStorage.getItem("folio-sidebar-collapsed") === "true";
      } catch {
        return false;
      }
    });
  useEffect(() => {
    try {
      localStorage.setItem("folio-sidebar-collapsed", String(collapsed));
    } catch {
      /* The sidebar still works when storage is unavailable. */
    }
  }, [collapsed]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 761px)");
    const closeMobile = () => {
      if (desktop.matches) setMobile(false);
    };
    desktop.addEventListener("change", closeMobile);
    return () => desktop.removeEventListener("change", closeMobile);
  }, []);
  useEffect(() => {
    setMobile(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);
  // Search and the support page can deep-link straight into the feedback dialog.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("feedback") === "1")
      setFeedback(true);
  }, [location.search]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMobile(false);
        setSearch((s) => !s);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {isDemoSession() && <DemoBanner />}
      <aside className="sidebar desktop-sidebar" id="desktop-navigation">
        <SidebarContent
          collapsed={collapsed}
          onToggle={() =>
            transitionAppearance(
              () => setCollapsed((value) => !value),
              "sidebar",
            )
          }
          onClose={() => setMobile(false)}
          onSearch={() => setSearch(true)}
          onFeedback={() => setFeedback(true)}
        />
      </aside>
      <div className="main-area">
        <div className="mobile-bar">
          <Dialog.Root open={mobile} onOpenChange={setMobile}>
            <Dialog.Trigger asChild>
              <IconButton label="Open navigation">
                <Menu size={21} />
              </IconButton>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="mobile-scrim" />
              <Dialog.Content
                className="sidebar mobile-sidebar open"
                aria-describedby={undefined}
              >
                <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                <SidebarContent
                  collapsed={false}
                  onToggle={() => {}}
                  onClose={() => setMobile(false)}
                  onSearch={() => {
                    setMobile(false);
                    setSearch(true);
                  }}
                  onFeedback={() => {
                    setMobile(false);
                    setFeedback(true);
                  }}
                />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <Brand />
          <IconButton label="Search" onClick={() => setSearch(true)}>
            <Search size={20} />
          </IconButton>
        </div>
        <main className="page-content" id="main-content">
          <Suspense
            fallback={
              <div className="route-loading">
                <Loading text="Loading your workspace…" />
              </div>
            }
          >
            <RouteErrorBoundary resetKey={location.pathname}>
              <div
                className="route-content"
                key={location.pathname.split("/")[1] || "dashboard"}
              >
                <Routes>
                  <Route
                    path="/dashboard"
                    element={
                      <Dashboard onAddAccount={() => setAccount(true)} />
                    }
                  />
                  <Route
                    path="/accounts"
                    element={<Accounts onAddAccount={() => setAccount(true)} />}
                  />
                  <Route path="/transactions" element={<Transactions />} />
                  <Route path="/cash-flow" element={<CashFlow />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/recurring" element={<Recurring />} />
                  <Route
                    path="/investments"
                    element={
                      <Investments onAddAccount={() => setAccount(true)} />
                    }
                  />
                  <Route
                    path="/forecast"
                    element={<Forecast onAddAccount={() => setAccount(true)} />}
                  />
                  <Route path="/credit-scores" element={<CreditScores />} />
                  <Route
                    path="/settings/*"
                    element={<Settings onAddAccount={() => setAccount(true)} />}
                  />
                  <Route path="/support" element={<Support />} />
                  <Route
                    path="*"
                    element={
                      <Dashboard onAddAccount={() => setAccount(true)} />
                    }
                  />
                </Routes>
              </div>
            </RouteErrorBoundary>
          </Suspense>
        </main>
      </div>
      <PlaidLinkFlow />
      <ReminderDispatcher />
      <GlobalSearch open={search} onClose={() => setSearch(false)} />
      <AddAccount open={account} onClose={() => setAccount(false)} />
      <FeedbackDialog open={feedback} onClose={() => setFeedback(false)} />
    </div>
  );
}
/**
 * Expanded: brand link plus a collapse control. Collapsed: the mark itself is
 * the expand control (hover or focus swaps in the panel icon), so the brand
 * never disappears. The toggle keeps its tree position across states so focus
 * stays on it after a keyboard toggle.
 */
function SidebarBrandRow({
  collapsed,
  onToggle,
  onClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  return (
    <div className="sidebar-top">
      {!collapsed && (
        <NavLink
          to="/dashboard"
          aria-label="Marten dashboard"
          onClick={onClose}
        >
          <Brand />
        </NavLink>
      )}
      <IconButton
        label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={`sidebar-collapse ${collapsed ? "sidebar-expand" : ""}`}
        aria-expanded={!collapsed}
        aria-controls="desktop-navigation"
        onClick={onToggle}
      >
        {collapsed && <Brand markOnly />}
        <PanelLeft size={19} strokeWidth={1.7} />
      </IconButton>
      <IconButton
        label="Close navigation"
        className="mobile-only"
        onClick={onClose}
      >
        <X size={20} />
      </IconButton>
    </div>
  );
}
function SidebarHint({
  label,
  enabled,
  children,
}: {
  label: string;
  enabled: boolean;
  children: ReactElement;
}) {
  if (!enabled) return children;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" side="right" sideOffset={10}>
          {label}
          <Tooltip.Arrow />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
function SidebarContent({
  collapsed,
  onToggle,
  onClose,
  onSearch,
  onFeedback,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSearch: () => void;
  onFeedback: () => void;
}) {
  const { pathname } = useLocation();
  const labels = useSidebarLabels();
  const hideAmounts = useAmountsHidden();
  const showLabels = collapsed && labels;
  const data = useData(),
    { signOut } = useAuthActions(),
    task = useTask(),
    { resolvedTheme, setTheme } = useTheme();
  return (
    <>
      <SidebarBrandRow
        collapsed={collapsed}
        onToggle={onToggle}
        onClose={onClose}
      />
      <nav>
        {nav.map((item) => (
          <SidebarHint key={item.path} label={item.label} enabled={showLabels}>
            <NavLink
              end={item.path === "/"}
              to={item.path}
              onClick={onClose}
              aria-label={item.label}
              className={`nav-item ${pathname === item.path ? "selected" : ""}`}
            >
              <item.icon size={21} strokeWidth={1.7} />
              <span>{item.label}</span>
            </NavLink>
          </SidebarHint>
        ))}
      </nav>
      <div className="sidebar-utils">
        <SidebarHint label="Search" enabled={showLabels}>
          <button
            type="button"
            className="nav-item"
            aria-label="Search"
            onClick={onSearch}
          >
            <Search size={21} strokeWidth={1.7} />
            <span>Search</span>
            <kbd>⌘ K</kbd>
          </button>
        </SidebarHint>
        <SidebarHint label="Settings" enabled={showLabels}>
          <NavLink
            to="/settings"
            onClick={onClose}
            aria-label="Settings"
            className={`nav-item ${pathname.startsWith("/settings") ? "selected" : ""}`}
          >
            <Settings2 size={21} strokeWidth={1.7} />
            <span>Settings</span>
          </NavLink>
        </SidebarHint>
        <SidebarHint label="Support Marten" enabled={showLabels}>
          <NavLink
            to="/support"
            onClick={onClose}
            aria-label="Support Marten"
            className={`nav-item nav-support ${pathname.startsWith("/support") ? "selected" : ""}`}
          >
            <Heart size={21} strokeWidth={1.7} />
            <span>Support Marten</span>
          </NavLink>
        </SidebarHint>
      </div>
      <div className="sidebar-spacer" />
      {data.profile?.demo && (
        <div className="sample-indicator" title="Sample data">
          <i />
          <span>Sample data</span>
        </div>
      )}
      <div className="sidebar-bottom">
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              type="button"
              className="profile-button"
              aria-label="Profile and preferences"
            >
              <Avatar
                name={data.profile?.name ?? "You"}
                logo={profileAvatarUrl(data.profile)}
              />
              <span>{data.profile?.name}</span>
              <ChevronDown size={15} />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="profile-menu"
              align="start"
              side="top"
              sideOffset={12}
            >
              <Popover.Close asChild>
                <NavLink to="/settings/preferences" onClick={onClose}>
                  <Settings2 size={16} />
                  Preferences
                </NavLink>
              </Popover.Close>
              <Popover.Close asChild>
                <button
                  type="button"
                  onClick={() => {
                    setAmountsHidden(!hideAmounts);
                    onClose();
                  }}
                >
                  {hideAmounts ? <Eye size={16} /> : <EyeOff size={16} />}
                  {hideAmounts ? "Show amounts" : "Hide amounts"}
                </button>
              </Popover.Close>
              <Popover.Close asChild>
                <NavLink to="/settings/faq" onClick={onClose}>
                  <CircleHelp size={16} />
                  Help & FAQ
                </NavLink>
              </Popover.Close>
              <Popover.Close asChild>
                <NavLink to="/changelog" onClick={onClose}>
                  <Sparkles size={16} />
                  What’s new
                </NavLink>
              </Popover.Close>
              <Popover.Close asChild>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onFeedback();
                  }}
                >
                  <MessageSquare size={16} />
                  Send feedback
                </button>
              </Popover.Close>
              {!isDemoSession() && (
                <Popover.Close asChild>
                  <a href="/demo" target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={16} />
                    Open demo
                  </a>
                </Popover.Close>
              )}
              <button
                type="button"
                onClick={() =>
                  void task.run(() =>
                    isDemoSession() ? exitDemo(signOut) : signOut(),
                  )
                }
              >
                <LogOut size={16} />
                {isDemoSession() ? "Exit demo" : "Sign out"}
              </button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <IconButton
          label={
            resolvedTheme === "dark"
              ? "Use light appearance"
              : "Use dark appearance"
          }
          onClick={() =>
            transitionAppearance(
              () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
              "theme",
            )
          }
        >
          {resolvedTheme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
        </IconButton>
      </div>
    </>
  );
}
