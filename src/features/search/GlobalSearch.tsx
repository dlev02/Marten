import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Search,
  X,
  WalletCards,
  CalendarDays,
  Settings2,
  Home,
  List,
  BarChart3,
  PieChart,
  TrendingUp,
  ChartNoAxesCombined,
  Gauge,
  Shapes,
  Store,
  Tags,
  Workflow,
  CircleHelp,
  FileUp,
} from "lucide-react";
import { Modal } from "../../components/folio/ui";
import { useData } from "../../lib/data";
import {
  searchDestinations,
  searchMatches,
  type SearchDestination,
} from "../../lib/searchCatalog";
import { faqQuestions } from "../../lib/faqQuestions";
import "./search.css";

const quickDestinations = new Set([
  "dashboard",
  "accounts",
  "transactions",
  "recurring",
  "forecast",
  "reports",
  "institutions",
  "preferences",
  "import",
]);
const pageIcons = {
  "/": Home,
  "/accounts": WalletCards,
  "/transactions": List,
  "/cash-flow": BarChart3,
  "/reports": PieChart,
  "/recurring": CalendarDays,
  "/investments": ChartNoAxesCombined,
  "/forecast": TrendingUp,
  "/credit-scores": Gauge,
};
function resultIcon(item: SearchDestination) {
  if (item.id === "transaction-search") return Search;
  if (item.id === "import") return FileUp;
  const sections = {
    Accounts: WalletCards,
    Merchants: Store,
    Categories: Shapes,
    Tags,
    Rules: Workflow,
    Recurring: CalendarDays,
    "Help & FAQ": CircleHelp,
  };
  return (
    sections[item.section as keyof typeof sections] ??
    pageIcons[item.path.split("?")[0] as keyof typeof pageIcons] ??
    Settings2
  );
}

export function GlobalSearch({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const data = useData();
  const navigate = useNavigate();
  const results = useRef<HTMLDivElement>(null);
  const searchContent = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const navigating = useRef(false);
  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
    }
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
  const matches = searchMatches(
    [
      ...searchDestinations.filter(
        (d) =>
          (d.id !== "sample" || data.profile?.demo) &&
          (query.trim() || quickDestinations.has(d.id)),
      ),
      ...dynamic,
    ],
    query,
  ).slice(0, query.trim() ? 30 : 10);
  const grouped = new Map<string, SearchDestination[]>();
  for (const item of matches) {
    const group =
      item.section === "Pages"
        ? "Go to"
        : item.section === "Preferences"
          ? "Settings"
          : item.section;
    grouped.set(group, [...(grouped.get(group) ?? []), item]);
  }
  if (query.trim())
    grouped.set("Search transactions", [
      {
        id: "transaction-search",
        title: `Search transactions for “${query.trim()}”`,
        section: "Transactions",
        path: `/transactions?search=${encodeURIComponent(query.trim())}`,
      },
    ]);
  const items = [...grouped.values()].flat();
  const selectedIndex = Math.min(activeIndex, items.length - 1);
  useEffect(() => {
    if (open)
      results.current
        ?.querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
  }, [open, selectedIndex]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Search Marten"
      className="command-palette"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        navigating.current = false;
        returnFocus.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        input.current?.focus();
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
        className="command-content"
        onKeyDown={(event) => {
          if (!["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
          if (
            event.key === "Enter" &&
            event.target === input.current &&
            items[selectedIndex]
          ) {
            event.preventDefault();
            go(items[selectedIndex].path);
          } else if (event.key !== "Enter" && items.length) {
            event.preventDefault();
            setActiveIndex(
              (selectedIndex +
                (event.key === "ArrowDown" ? 1 : -1) +
                items.length) %
                items.length,
            );
            input.current?.focus();
          }
        }}
      >
        <div className="command-input">
          <Search size={19} aria-hidden="true" />
          <input
            ref={input}
            role="combobox"
            aria-label="Search Marten"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={
              items[selectedIndex] ? `${listId}-${selectedIndex}` : undefined
            }
            autoComplete="off"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="Search pages, accounts, settings…"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                setActiveIndex(0);
                input.current?.focus();
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div
          className="global-results"
          ref={results}
          id={listId}
          role="listbox"
          aria-label="Search results"
        >
          {[...grouped].map(([group, entries], groupIndex) => (
            <div
              key={group}
              className="command-group"
              role="group"
              aria-labelledby={`${listId}-group-${groupIndex}`}
            >
              <h3 id={`${listId}-group-${groupIndex}`}>{group}</h3>
              {entries.map((item) => {
                const index = items.indexOf(item);
                const Icon = resultIcon(item);
                return (
                  <button
                    id={`${listId}-${index}`}
                    key={item.id}
                    role="option"
                    aria-selected={selectedIndex === index}
                    tabIndex={-1}
                    onPointerMove={() => setActiveIndex(index)}
                    onClick={() => go(item.path)}
                  >
                    <Icon size={17} strokeWidth={1.7} aria-hidden="true" />
                    <span>{item.title}</span>
                    <ArrowUpRight
                      size={14}
                      aria-hidden="true"
                      className="command-open-icon"
                    />
                  </button>
                );
              })}
            </div>
          ))}
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
