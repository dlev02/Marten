import type { ReactNode } from "react";
import { Bug, Heart, Megaphone } from "lucide-react";
import { GitHubIcon } from "../../site/GitHubIcon";
import { site } from "../../site/siteConfig";
import "./support.css";

/**
 * The donation story, shared by the public /support page and the in-app
 * "Support Marten" screen. Ko-fi is the only payment path; nothing here
 * changes what a user can do in the app.
 */
export function SupportContent({
  onFeedback,
  compact = false,
}: {
  /** In-app only: opens the feedback dialog instead of leaving for GitHub. */
  onFeedback?: () => void;
  compact?: boolean;
}) {
  const feedback: ReactNode = onFeedback ? (
    <button type="button" className="support-way" onClick={onFeedback}>
      <Bug size={18} aria-hidden="true" />
      <span>
        <strong>Report a bug or share an idea</strong>
        <small>Fixing what bugs you is the best kind of help.</small>
      </span>
    </button>
  ) : (
    <a
      className="support-way"
      href={site.newIssue}
      target="_blank"
      rel="noreferrer"
    >
      <Bug size={18} aria-hidden="true" />
      <span>
        <strong>Report a bug or share an idea</strong>
        <small>Fixing what bugs you is the best kind of help.</small>
      </span>
    </a>
  );
  return (
    <div className={`support-content ${compact ? "compact" : ""}`}>
      <div className="support-hero">
        <div className="support-art" aria-hidden="true">
          <span className="support-mark" />
          <span className="support-heart">
            <Heart size={22} />
          </span>
        </div>
        <div>
          {compact ? (
            <h2>Marten is free. Help keep it that way.</h2>
          ) : (
            <h1>Marten is free. Help keep it that way.</h1>
          )}
          <p>
            This is a passion project, built for family and shared with anyone
            who wants it. There is no subscription, no ad, and no plan to add
            either. If Marten saves you an evening a month, a small donation
            keeps the domain paid and the improvements coming.
          </p>
          <div className="support-actions">
            <a
              className="support-kofi"
              href={site.kofi}
              target="_blank"
              rel="noreferrer"
            >
              <Heart size={17} aria-hidden="true" />
              Support on Ko-fi
            </a>
            <small>One-time or monthly, any amount. Opens Ko-fi.</small>
          </div>
        </div>
      </div>
      <div className="support-columns">
        <section>
          <h2>What it pays for</h2>
          <ul>
            <li>The domain name and email for the hosted site.</li>
            <li>
              Time spent on bank-provider quirks, imports, and design polish.
            </li>
            <li>Keeping the hosted site free for everyone who signs up.</li>
          </ul>
        </section>
        <section>
          <h2>Other ways to help</h2>
          <div className="support-ways">
            <a
              className="support-way"
              href={site.github}
              target="_blank"
              rel="noreferrer"
            >
              <GitHubIcon size={18} />
              <span>
                <strong>Star the project on GitHub</strong>
                <small>It helps other people find it.</small>
              </span>
            </a>
            {feedback}
            <div className="support-way static">
              <Megaphone size={18} aria-hidden="true" />
              <span>
                <strong>Tell someone who keeps a spreadsheet</strong>
                <small>Marten was built for exactly that person.</small>
              </span>
            </div>
          </div>
        </section>
      </div>
      <p className="support-note">
        Donations are voluntary gifts, not purchases. They never unlock
        features, and everything in Marten stays free whether you donate or not.
      </p>
    </div>
  );
}
