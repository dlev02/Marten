import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { faqQuestions } from "../../lib/faqQuestions";
import { ChevronDown, Search } from "lucide-react";
import "./faq.css";

export default function FAQ() {
  const [params] = useSearchParams();
  const selectedQuestion = params.get("question") ?? "";
  const [search, setSearch] = useState(selectedQuestion);
  useEffect(() => setSearch(selectedQuestion), [selectedQuestion]);
  const filtered = faqQuestions.filter(({ question, answer }) =>
    `${question} ${answer}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <>
      <div className="settings-section-header">
        <div>
          <h2>Help & FAQ</h2>
          <p>A few useful things to know about Marten.</p>
        </div>
      </div>
      <div className="faq-search">
        <Search size={18} aria-hidden="true" />
        <input
          aria-label="Search frequently asked questions"
          placeholder="Search questions"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          type="search"
        />
      </div>
      <div className="faq-list">
        {filtered.map((item) => (
          <details
            key={item.question}
            className="faq-item"
            open={item.question === selectedQuestion || undefined}
          >
            <summary>
              {item.question}
              <ChevronDown size={17} aria-hidden="true" />
            </summary>
            <div className="faq-answer">
              <p>{item.answer}</p>
              {item.to && (
                <Link className="text-link" to={item.to}>
                  {item.linkLabel}
                </Link>
              )}
              {item.source && (
                <a
                  className="text-link"
                  href={item.source}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.sourceLabel} ↗
                </a>
              )}
            </div>
          </details>
        ))}
        {!filtered.length && (
          <p className="faq-empty">
            No matching questions. Try “bank”, “import”, or “password”.
          </p>
        )}
      </div>
    </>
  );
}
