import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Search } from "lucide-react";
import { Modal, SearchBox } from "../../components/folio/ui";
import { useData } from "../../lib/data";
import {
  searchDestinations,
  searchMatches,
  type SearchDestination,
} from "../../lib/searchCatalog";
import { faqQuestions } from "../../lib/faqQuestions";
import "./search.css";

export function GlobalSearch({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const data = useData();
  const navigate = useNavigate();
  const results = useRef<HTMLDivElement>(null);
  const searchContent = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const navigating = useRef(false);
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);
  const go = (url: string) => {
    navigating.current = true;
    void navigate(url);
    onClose();
  };
  const dynamic: SearchDestination[] = query.trim()
    ? [
        ...faqQuestions.map((item, index) => ({
          id: `faq-${index}`,
          title: item.question,
          section: "Help & FAQ",
          path: `/settings/faq?question=${encodeURIComponent(item.question)}`,
          keywords: item.answer,
        })),
        ...data.accounts.map((a) => ({
          id: a._id,
          title: a.name,
          section: "Accounts",
          path: `/accounts?account=${a._id}`,
          keywords: a.institution,
        })),
        ...data.merchants.map((m) => ({
          id: m._id,
          title: m.name,
          section: "Merchants",
          path: `/transactions?merchant=${m._id}`,
        })),
        ...data.categories.map((c) => ({
          id: c._id,
          title: c.name,
          section: "Categories",
          path: `/transactions?category=${c._id}`,
          keywords: data.groups.find((g) => g._id === c.groupId)?.name,
        })),
        ...data.tags.map((t) => ({
          id: t._id,
          title: t.name,
          section: "Tags",
          path: `/transactions?tag=${t._id}`,
        })),
        ...data.rules.map((r) => ({
          id: r._id,
          title: r.name,
          section: "Rules",
          path: `/settings/rules?search=${encodeURIComponent(r.name)}`,
        })),
        ...data.recurring.map((r) => {
          const name =
            r.name ??
            data.merchants.find((m) => m._id === r.merchantId)?.name ??
            "Recurring item";
          return {
            id: r._id,
            title: name,
            section: "Recurring",
            path: `/recurring?search=${encodeURIComponent(name)}`,
            keywords: `${r.note} ${r.frequency}`,
          };
        }),
        ...data.savedReports.map((r) => ({
          id: r._id,
          title: r.name,
          section: "Saved reports",
          path: `/reports?report=${r._id}`,
        })),
      ]
    : [];
  const items = searchMatches(
    [
      ...searchDestinations.filter(
        (d) => d.id !== "sample" || data.profile?.demo,
      ),
      ...dynamic,
    ],
    query,
  ).slice(0, query.trim() ? 30 : 25);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Search Marten"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        navigating.current = false;
        returnFocus.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        searchContent.current?.querySelector("input")?.focus();
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (navigating.current) return;
        const previous = returnFocus.current;
        if (
          previous?.isConnected &&
          previous !== document.body &&
          previous.getClientRects().length
        )
          previous.focus();
        else
          Array.from(
            document.querySelectorAll<HTMLButtonElement>(
              'button[aria-label="Search"]',
            ),
          )
            .find((button) => button.getClientRects().length)
            ?.focus();
      }}
    >
      <div
        ref={searchContent}
        onKeyDown={(event) => {
          if (!["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
          const buttons = Array.from(
            results.current?.querySelectorAll<HTMLButtonElement>("button") ??
              [],
          );
          const current = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          if (
            event.key === "Enter" &&
            event.target instanceof HTMLInputElement &&
            buttons[0]
          ) {
            event.preventDefault();
            buttons[0].click();
          } else if (event.key !== "Enter" && buttons.length) {
            event.preventDefault();
            buttons[
              current === -1
                ? event.key === "ArrowDown"
                  ? 0
                  : buttons.length - 1
                : (current +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    buttons.length) %
                  buttons.length
            ].focus();
          }
        }}
      >
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search settings, accounts, transactions…"
        />
        <div
          className="global-results"
          ref={results}
          aria-label="Search results"
        >
          {items.map((item) => (
            <button key={item.id} onClick={() => go(item.path)}>
              <ArrowUpRight size={17} aria-hidden="true" />
              <span>{item.title}</span>
              <small>{item.section}</small>
            </button>
          ))}
          {query.trim() && (
            <button
              onClick={() =>
                go(`/transactions?search=${encodeURIComponent(query.trim())}`)
              }
            >
              <Search size={18} aria-hidden="true" />
              <span>Search transactions for “{query.trim()}”</span>
            </button>
          )}
        </div>
      </div>
      <footer className="search-footer">
        <kbd>↑ ↓</kbd>
        <span>to navigate</span>
        <kbd>↵</kbd>
        <span>to open</span>
        <kbd>esc</kbd>
        <span>to close</span>
      </footer>
    </Modal>
  );
}
