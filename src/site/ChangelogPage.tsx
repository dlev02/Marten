import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { SiteLayout } from "./SiteLayout";
import { Inline } from "./inline";
import { useDocumentTitle } from "./useDocumentTitle";
import { site } from "./siteConfig";
import {
  changeKindLabels,
  changelog,
  type ChangelogEntry,
} from "./content/changelog";

const monthDay = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
});
const year = new Intl.DateTimeFormat("en-US", { year: "numeric" });
function parse(date: string) {
  return new Date(`${date}T12:00:00`);
}
function entryId(entry: ChangelogEntry) {
  return `release-${entry.date}`;
}

/** Tracks the release nearest the top so the date rail can follow along. */
function useCurrentRelease(ids: string[]) {
  const [current, setCurrent] = useState(ids[0] ?? "");
  useEffect(() => {
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    if (!elements.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [ids]);
  return current;
}

export function ChangelogPage() {
  useDocumentTitle(
    "Changelog · Marten",
    "Everything that changed in Marten, release by release.",
  );
  const ids = changelog.map(entryId);
  const current = useCurrentRelease(ids);
  const years = changelog.map((entry) => year.format(parse(entry.date)));
  const spansYears = new Set(years).size > 1;
  return (
    <SiteLayout tone="paper">
      <div className="changelog">
        <header className="changelog-head">
          <h1>Changelog</h1>
          <p className="changelog-summary">
            What changed in Marten, written in plain words, newest first.
          </p>
          <a
            className="changelog-head-link"
            href={`${site.github}/commits/main`}
            target="_blank"
            rel="noreferrer"
          >
            Every commit on GitHub <ArrowUpRight size={14} aria-hidden />
          </a>
        </header>
        <div className="changelog-grid">
          <aside className="changelog-rail" aria-label="Releases">
            <ol>
              {changelog.map((entry, index) => (
                <li key={entry.date}>
                  <a
                    href={`#${entryId(entry)}`}
                    className={current === entryId(entry) ? "is-current" : ""}
                  >
                    <span>{monthDay.format(parse(entry.date))}</span>
                    {spansYears &&
                      (index === 0 || years[index - 1] !== years[index]) && (
                        <small>{years[index]}</small>
                      )}
                  </a>
                </li>
              ))}
            </ol>
          </aside>
          <div className="changelog-entries">
            {changelog.map((entry, index) => (
              <article key={entry.date} id={entryId(entry)} className="release">
                <div className="release-stamp" aria-hidden="true">
                  <span className="release-day">
                    {parse(entry.date).getDate()}
                  </span>
                  <span className="release-month">
                    {parse(entry.date).toLocaleDateString("en-US", {
                      month: "short",
                    })}{" "}
                    {year.format(parse(entry.date))}
                  </span>
                </div>
                <div className="release-body">
                  <div className="release-meta">
                    <time dateTime={entry.date} className="release-date">
                      {monthDay.format(parse(entry.date))},{" "}
                      {year.format(parse(entry.date))}
                    </time>
                    {index === 0 && (
                      <span className="release-latest">Latest</span>
                    )}
                  </div>
                  <h2>{entry.title}</h2>
                  <p className="release-lead">
                    <Inline text={entry.lead} />
                  </p>
                  {entry.groups.map((group) => (
                    <section
                      key={group.kind}
                      className={`release-group release-${group.kind}`}
                    >
                      <h3>
                        <i aria-hidden="true" />
                        {changeKindLabels[group.kind]}
                      </h3>
                      <ul>
                        {group.items.map((item, itemIndex) => (
                          <li key={itemIndex}>
                            <Inline text={item} />
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </article>
            ))}
            <footer className="changelog-foot">
              <p>
                Spotted something off?{" "}
                <a
                  className="site-link"
                  href={site.newIssue}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open an issue
                </a>{" "}
                or send feedback from inside Marten.
              </p>
            </footer>
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}
