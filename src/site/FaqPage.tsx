import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { publicFaq } from "./content/faq";
import type { FaqEntry } from "./content/types";
import { Inline } from "./inline";
import { SiteLayout } from "./SiteLayout";
import { useDocumentTitle } from "./useDocumentTitle";

const order: FaqEntry["category"][] = [
  "Getting started",
  "Banks & data",
  "Privacy & security",
  "Hosting & open source",
  "Support the project",
];

export function FaqPage() {
  useDocumentTitle(
    "FAQ · Marten",
    "Answers about Marten's free personal finance app: banks, privacy, self-hosting, and support.",
  );
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = publicFaq.filter(
      (entry) =>
        !needle ||
        `${entry.question} ${entry.answer}`.toLowerCase().includes(needle),
    );
    return order
      .map((category) => ({
        category,
        entries: matches.filter((entry) => entry.category === category),
      }))
      .filter((group) => group.entries.length);
  }, [query]);
  const openAll = query.trim().length > 0;
  return (
    <SiteLayout tone="paper">
      <div className="faq-page">
        <header>
          <h1>Questions, answered plainly.</h1>
          <p>
            What Marten is, how bank connections work, what happens to your
            data, and how to run your own copy.
          </p>
        </header>
        <div className="faq-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search questions"
            aria-label="Search frequently asked questions"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {groups.map((group) => (
          <section key={group.category} className="faq-group">
            <h2>{group.category}</h2>
            {group.entries.map((entry) => (
              <details
                key={entry.id}
                id={entry.id}
                className="faq-entry"
                open={openAll || undefined}
              >
                <summary>
                  {entry.question}
                  <ChevronDown size={18} aria-hidden="true" />
                </summary>
                <div>
                  <Inline text={entry.answer} />
                </div>
              </details>
            ))}
          </section>
        ))}
        {!groups.length && (
          <p className="faq-empty">
            Nothing matches yet. Try “bank”, “delete”, or “self-host”.
          </p>
        )}
      </div>
    </SiteLayout>
  );
}
