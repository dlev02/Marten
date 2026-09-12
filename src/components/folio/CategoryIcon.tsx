import { useRef, useState, type KeyboardEvent } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useTheme } from "next-themes";
import { ChevronDown } from "lucide-react";
import {
  categoryIcons,
  categoryIconGroups,
  getCategoryIcon,
  searchCategoryIcons,
} from "../../lib/categoryIcons";
import { PickerPortalContext, Select } from "./Select";
import "./category-icon.css";

/** Stored emoji remain portable; the illustrated presentation is a device preference. */
export function CategoryIcon({
  emoji,
  className = "",
}: {
  emoji?: string;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  if (!emoji) return null;
  const icon = getCategoryIcon(emoji);
  return (
    <span
      className={`category-icon ${icon ? "has-illustration" : ""} ${className}`}
      aria-hidden="true"
    >
      {icon && (
        <img
          src={`/category-icons/${resolvedTheme === "dark" ? icon.darkFile : icon.file}`}
          alt=""
          width="24"
          height="24"
        />
      )}
      <span className="category-native-emoji">{emoji}</span>
    </span>
  );
}

/** One portable emoji value, with artwork controlled by the existing appearance preference. */
export function CategoryIconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(value);
  const [group, setGroup] = useState("");
  const grid = useRef<HTMLDivElement>(null);
  const selected = getCategoryIcon(value);
  const results = searchCategoryIcons(search, group);
  function choose(emoji: string) {
    onChange(emoji);
    setOpen(false);
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const offsets: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 5,
      ArrowUp: -5,
    };
    let next = index + (offsets[event.key] ?? 0);
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = results.length - 1;
    else if (!(event.key in offsets)) return;
    event.preventDefault();
    const buttons = grid.current?.querySelectorAll<HTMLButtonElement>("button");
    buttons?.[Math.max(0, Math.min(results.length - 1, next))]?.focus();
  }
  return (
    <Popover.Root
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setSearch("");
          setGroup("");
          setDraft(value);
        }
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          className="category-picker-trigger"
          aria-label={`Choose category icon: ${selected?.name ?? value}`}
        >
          <CategoryIcon emoji={value} />
          <ChevronDown size={14} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="category-picker-menu"
          align="start"
          sideOffset={7}
          collisionPadding={12}
          aria-label="Choose category icon"
        >
          <label className="category-picker-search">
            <span>Find an icon</span>
            <input
              aria-label="Search category icons"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                if (grid.current) grid.current.scrollTop = 0;
              }}
              placeholder="Search food, home, travel…"
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  grid.current
                    ?.querySelector<HTMLButtonElement>("button")
                    ?.focus();
                }
              }}
            />
          </label>
          <PickerPortalContext.Provider value={null}>
            <Select
              aria-label="Icon collection"
              value={group}
              onValueChange={(next) => {
                setGroup(next);
                if (grid.current) grid.current.scrollTop = 0;
              }}
              options={[
                { value: "", label: "All icons" },
                ...categoryIconGroups.map((name) => ({
                  value: name,
                  label: name,
                })),
              ]}
            />
          </PickerPortalContext.Provider>
          <p className="category-picker-count" role="status">
            {results.length} of {categoryIcons.length} icons
          </p>
          <div
            className="category-icon-picker"
            role="group"
            aria-label="Category icons"
            ref={grid}
          >
            {results.map((icon, index) => (
              <button
                key={icon.emoji}
                type="button"
                aria-label={icon.name}
                title={icon.name}
                aria-pressed={selected?.emoji === icon.emoji}
                onKeyDown={(event) => navigate(event, index)}
                onClick={() => choose(icon.emoji)}
              >
                <CategoryIcon emoji={icon.emoji} />
              </button>
            ))}
          </div>
          {!results.length && (
            <p role="status">
              No icons found. Try another word or use an emoji below.
            </p>
          )}
          <label className="category-picker-custom">
            <span>Any emoji</span>
            <div>
              <input
                aria-label="Any emoji"
                value={draft}
                maxLength={30}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (draft.trim()) choose(draft.trim());
                  }
                }}
              />
              <button
                type="button"
                disabled={!draft.trim()}
                onClick={() => choose(draft.trim())}
              >
                Use emoji
              </button>
            </div>
          </label>
          <p>Custom Marten artwork. You can also paste any emoji.</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
