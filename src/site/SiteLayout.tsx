import { useEffect, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { ArrowUpRight, Heart, Menu, X } from "lucide-react";
import { GitHubIcon } from "./GitHubIcon";
import { useState } from "react";
import { Brand } from "../features/Auth";
import { site } from "./siteConfig";

const primaryNav = [
  { to: "/#features", label: "Product" },
  { to: "/faq", label: "FAQ" },
  { to: "/about", label: "About" },
  { to: "/support", label: "Support" },
];

export function SiteLayout({
  children,
  tone = "day",
}: {
  children: ReactNode;
  /** "day" keeps the warm canvas; "paper" is the reading tone for documents. */
  tone?: "day" | "paper";
}) {
  const { isAuthenticated } = useConvexAuth();
  const location = useLocation();
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    setMenu(false);
    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) {
        target.scrollIntoView({ block: "start" });
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname, location.hash]);
  return (
    <div className={`site site-${tone}`} data-menu={menu ? "open" : "closed"}>
      <a href="#site-main" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <Link to="/" className="site-brand" aria-label="Marten home">
            <Brand />
          </Link>
          <nav className="site-nav" aria-label="Site">
            {primaryNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `site-nav-link ${isActive && !item.to.includes("#") ? "is-active" : ""}`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <a
              className="site-nav-link"
              href={site.github}
              target="_blank"
              rel="noreferrer"
            >
              GitHub
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </nav>
          <div className="site-actions">
            {isAuthenticated ? (
              <Link to="/dashboard" className="site-button primary">
                Open Marten
              </Link>
            ) : (
              <>
                <Link to="/sign-in" className="site-button ghost">
                  Sign in
                </Link>
                <a
                  href="/demo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="site-button primary"
                >
                  Try the demo
                </a>
              </>
            )}
            <button
              type="button"
              className="site-menu-toggle"
              aria-expanded={menu}
              aria-controls="site-mobile-nav"
              aria-label={menu ? "Close menu" : "Open menu"}
              onClick={() => setMenu((open) => !open)}
            >
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        <div className="site-mobile-nav" id="site-mobile-nav" hidden={!menu}>
          {primaryNav.map((item) => (
            <Link key={item.to} to={item.to}>
              {item.label}
            </Link>
          ))}
          <a href={site.github} target="_blank" rel="noreferrer">
            GitHub
          </a>
          {isAuthenticated ? (
            <Link to="/dashboard">Open Marten</Link>
          ) : (
            <Link to="/sign-in">Sign in</Link>
          )}
        </div>
      </header>
      <main id="site-main" className="site-main">
        {children}
      </main>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="site-footer-brand">
            <Brand />
            <p>
              Free, open-source personal finance. Built by {site.operator} for
              family, shared with everyone.
            </p>
            <a
              className="site-button kofi"
              href={site.kofi}
              target="_blank"
              rel="noreferrer"
            >
              <Heart size={15} aria-hidden="true" />
              Support on Ko-fi
            </a>
          </div>
          <nav className="site-footer-columns" aria-label="Footer">
            <div>
              <h3>Product</h3>
              <Link to="/#features">Features</Link>
              <a href="/demo" target="_blank" rel="noopener noreferrer">
                Live demo
              </a>
              <Link to="/faq">FAQ</Link>
              <Link to="/support">Support the project</Link>
            </div>
            <div>
              <h3>Trust</h3>
              <Link to="/privacy">Privacy policy</Link>
              <Link to="/terms">Terms of service</Link>
              <Link to="/security">Security</Link>
            </div>
            <div>
              <h3>Project</h3>
              <Link to="/about">Why Marten exists</Link>
              <a href={site.github} target="_blank" rel="noreferrer">
                <GitHubIcon size={14} /> Source on GitHub
              </a>
              <a href={site.newIssue} target="_blank" rel="noreferrer">
                Report a bug or idea
              </a>
              <a
                href={`${site.github}#self-hosting`}
                target="_blank"
                rel="noreferrer"
              >
                Self-host Marten
              </a>
            </div>
          </nav>
        </div>
        <div className="site-footer-legal">
          <span>© 2026 {site.operator}. No ads, no data sales, ever.</span>
          <span>
            Marten is not a bank and does not give financial advice. Bank data
            arrives through Plaid or your own SimpleFIN Bridge subscription.
          </span>
        </div>
      </footer>
    </div>
  );
}
