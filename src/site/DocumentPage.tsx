import { useEffect, useState } from "react";
import type { SiteBlock, SiteDocument } from "./content/types";
import { Inline } from "./inline";
import { SiteLayout } from "./SiteLayout";
import { useDocumentTitle } from "./useDocumentTitle";
import { site } from "./siteConfig";

function Block({ block }: { block: SiteBlock }) {
  switch (block.type) {
    case "p":
      return (
        <p>
          <Inline text={block.text} />
        </p>
      );
    case "callout":
      return (
        <div className="doc-callout">
          <Inline text={block.text} />
        </div>
      );
    case "ul":
    case "ol": {
      const items = block.items.map((item, index) => (
        <li key={index}>
          <Inline text={item} />
        </li>
      ));
      return block.type === "ul" ? <ul>{items}</ul> : <ol>{items}</ol>;
    }
    case "table":
      return (
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                {block.head.map((cell) => (
                  <th key={cell} scope="col">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Tracks which section heading is nearest the top for the side navigation. */
function useCurrentSection(ids: string[]) {
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
      { rootMargin: "-80px 0px -70% 0px" },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [ids]);
  return current;
}

export function DocumentPage({ document }: { document: SiteDocument }) {
  useDocumentTitle(`${document.title} · Marten`, document.summary);
  const ids = document.sections.map((section) => section.id);
  const current = useCurrentSection(ids);
  return (
    <SiteLayout tone="paper">
      <div className="doc">
        <aside className="doc-aside" aria-label="On this page">
          <div className="doc-meta">Effective {document.effective}</div>
          <nav>
            {document.sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={current === section.id ? "is-current" : ""}
              >
                {section.heading}
              </a>
            ))}
          </nav>
        </aside>
        <article className="doc-body">
          <header>
            <h1>{document.title}</h1>
            <p>{document.summary}</p>
          </header>
          {document.sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2>{section.heading}</h2>
              {section.blocks.map((block, index) => (
                <Block key={index} block={block} />
              ))}
            </section>
          ))}
          <footer className="doc-footer">
            Questions about this page? Open{" "}
            <a
              className="site-link"
              href={site.newIssue}
              target="_blank"
              rel="noreferrer"
            >
              an issue on GitHub
            </a>
            {site.contactEmail ? (
              <>
                {" "}
                or email{" "}
                <a className="site-link" href={`mailto:${site.contactEmail}`}>
                  {site.contactEmail}
                </a>
              </>
            ) : null}
            .
          </footer>
        </article>
      </div>
    </SiteLayout>
  );
}
