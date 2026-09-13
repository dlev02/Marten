import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  Check,
  ChevronDown,
  Loader2,
  Plus,
  Search,
  X,
  Info,
} from "lucide-react";
import { Button as BaseButton } from "../ui/button";
import { message } from "../../lib/format";
import { brandLogo } from "../../lib/brandLogos";
import { PickerPortalContext } from "./Select";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: "default" | "primary" | "quiet" | "danger";
    icon?: ReactNode;
  }
>(function Button(
  { children, tone = "default", icon, className = "", ...props },
  ref,
) {
  return (
    <BaseButton
      ref={ref}
      type="button"
      {...props}
      className={`f-button ${tone} ${className}`}
      variant="outline"
    >
      {icon}
      {children}
    </BaseButton>
  );
});
Button.displayName = "Button";

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    children: ReactNode;
  }
>(function IconButton({ label, children, ...props }, ref) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          ref={ref}
          type="button"
          {...props}
          className={`icon-button ${props.className ?? ""}`}
          aria-label={label}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={7}>
          {label}
          <Tooltip.Arrow />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
});
IconButton.displayName = "IconButton";
/** Use disclosure for help that needs to stay open on click or touch. */
export function InfoTip({
  label,
  text,
  disclosure = false,
}: {
  label: string;
  text: ReactNode;
  disclosure?: boolean;
}) {
  if (disclosure)
    return (
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="info-tip info-disclosure"
            aria-label={label}
          >
            <Info size={16} aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="tooltip tooltip-wide info-disclosure-content"
            aria-label={label}
            sideOffset={7}
            collisionPadding={16}
          >
            {text}
            <Popover.Arrow />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button type="button" className="info-tip" aria-label={label}>
          <Info size={13} aria-hidden="true" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip tooltip-wide" sideOffset={7}>
          {text}
          <Tooltip.Arrow />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <header className="panel-header">
          <h2>{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
  drawer = false,
  description,
  onOpenAutoFocus,
  onCloseAutoFocus,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  drawer?: boolean;
  description?: string;
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
  className?: string;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(
    null,
  );
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          ref={setPortalContainer}
          className={`${drawer ? "drawer" : `modal ${wide ? "wide" : ""}`} ${className}`}
          {...(!description ? { "aria-describedby": undefined } : {})}
          onEscapeKeyDown={(event) => {
            // Escape cancels an active reorder before it dismisses the dialog.
            if (portalContainer?.querySelector("[data-active-drag]")) {
              event.preventDefault();
            }
          }}
          onOpenAutoFocus={(event) => {
            returnFocus.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            if (onOpenAutoFocus) return onOpenAutoFocus(event);
            // Starting at Close focuses its tooltip, which consumes the first Escape.
            const content = event.target;
            if (!(content instanceof HTMLElement)) return;
            event.preventDefault();
            const firstInput = Array.from(
              content.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
                'input:not([type="hidden"]):not([type="file"]):not([disabled]), textarea:not([disabled])',
              ),
            ).find((input) => input.getClientRects().length);
            (firstInput ?? content).focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            if (onCloseAutoFocus) return onCloseAutoFocus(event);
            event.preventDefault();
            const target = returnFocus.current;
            if (target?.isConnected) target.focus({ preventScroll: true });
          }}
        >
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Close">
                <X size={20} />
              </IconButton>
            </Dialog.Close>
          </div>
          {description && (
            <Dialog.Description className="muted modal-description">
              {description}
            </Dialog.Description>
          )}
          <PickerPortalContext.Provider value={portalContainer}>
            {children}
          </PickerPortalContext.Provider>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label id={id}>{label}</label>
      <div aria-labelledby={id}>{children}</div>
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}
export function Picker({
  value,
  onChange,
  options,
  placeholder = "Choose…",
  label,
  className = "",
  disabled = false,
  onCreate,
  createLabel = "Create new",
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; icon?: ReactNode; group?: string }[];
  placeholder?: string;
  label: string;
  className?: string;
  disabled?: boolean;
  onCreate?: (search: string) => void;
  createLabel?: string;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const portalContainer = useContext(PickerPortalContext);
  const optionsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const selected = options.find((o) => o.value === value);
  const filtered = options.filter((o) =>
    `${o.label} ${o.group ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Popover.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        setSearch("");
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          className={`picker ${className}`}
          disabled={disabled}
          aria-label={label}
        >
          {selected?.icon}
          <span className={`picker-label ${selected ? "" : "muted"}`}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown size={15} />
        </button>
      </Popover.Trigger>
      <Popover.Portal container={portalContainer}>
        <Popover.Content
          className="picker-menu"
          align="start"
          sideOffset={5}
          collisionPadding={12}
          collisionBoundary={portalContainer}
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
              return;
            const inSearch = event.target === searchRef.current;
            if (inSearch && (event.key === "Home" || event.key === "End"))
              return;
            const buttons = Array.from(
              optionsRef.current?.querySelectorAll<HTMLButtonElement>(
                ".picker-option",
              ) ?? [],
            );
            if (!buttons.length) return;
            event.preventDefault();
            const current = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : event.key === "ArrowDown"
                    ? (current + 1) % buttons.length
                    : current < 0
                      ? buttons.length - 1
                      : (current - 1 + buttons.length) % buttons.length;
            buttons[next].focus({ preventScroll: true });
            buttons[next].scrollIntoView({ block: "nearest" });
          }}
        >
          <div className="picker-search">
            <Search size={16} />
            <input
              ref={searchRef}
              aria-controls={menuId}
              aria-label={`Search ${label.toLowerCase()}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
            />
          </div>
          <div className="picker-options" id={menuId} ref={optionsRef}>
            {filtered.map((o, i) => (
              <div key={o.value}>
                {o.group && o.group !== filtered[i - 1]?.group && (
                  <div className="picker-group">{o.group}</div>
                )}
                <button
                  type="button"
                  className="picker-option"
                  aria-pressed={value === o.value}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  {o.icon}
                  <span className="picker-label">{o.label}</span>
                  {value === o.value && <Check size={15} />}
                </button>
              </div>
            ))}
            {!filtered.length && (
              <div className="empty-compact muted">No results</div>
            )}
            {onCreate && (
              <button
                type="button"
                className="picker-option"
                onClick={() => {
                  setOpen(false);
                  onCreate(search.trim());
                }}
              >
                <Plus size={15} />
                <span>
                  {createLabel}
                  {search.trim() ? ` “${search.trim()}”` : ""}
                </span>
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
export function Tabs({
  value,
  onChange,
  items,
  pill = false,
}: {
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: string; icon?: ReactNode }[];
  pill?: boolean;
}) {
  return (
    <div className={pill ? "segments" : "tabs"} role="tablist">
      {items.map((item) => (
        <button
          type="button"
          key={item.value}
          role="tab"
          aria-selected={value === item.value}
          className={value === item.value ? "active" : ""}
          onClick={() => onChange(item.value)}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
export function Loading({
  text = "Loading your finances…",
  full = false,
}: {
  text?: string;
  full?: boolean;
}) {
  return (
    <div className={`loading ${full ? "full" : ""}`} role="status">
      {full ? (
        <span className="loading-mark" aria-hidden="true" />
      ) : (
        <Loader2 className="spin" size={22} />
      )}
      <span>{text}</span>
    </div>
  );
}
export function Empty({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function Avatar({
  name,
  logo,
  color,
  size = "normal",
}: {
  name: string;
  logo?: string | null;
  color?: string;
  size?: "small" | "normal" | "large";
}) {
  const [failedLogos, setFailedLogos] = useState<string[]>([]);
  const resolvedLogo = [logo, brandLogo(name)].find(
    (candidate) => candidate && !failedLogos.includes(candidate),
  );
  const showLogo = !!resolvedLogo;
  return (
    <span
      className={`avatar ${size} ${showLogo ? "has-logo" : ""}`}
      style={{
        background: showLogo ? "#fff" : (color ?? "var(--avatar)"),
        color: color ? "#fff" : "var(--muted)",
      }}
    >
      {showLogo ? (
        <img
          src={resolvedLogo}
          alt=""
          onError={() => setFailedLogos((failed) => [...failed, resolvedLogo])}
          referrerPolicy="no-referrer"
        />
      ) : (
        name
          .split(/[\s&]+/)
          .slice(0, 2)
          .map((n) => n[0])
          .join("")
          .toUpperCase()
      )}
    </span>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className="toggle-row">
      <div>
        <strong>{label}</strong>
        {description && <p>{description}</p>}
      </div>
      <input
        type="checkbox"
        role="switch"
        disabled={disabled}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch" />
    </label>
  );
}
const ToastContext = createContext<(value: string, error?: boolean) => void>(
  () => {},
);
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<
    { id: number; text: string; error: boolean }[]
  >([]);
  const toast = useCallback((value: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text: value, error }]);
    setTimeout(() => setToasts((t) => t.filter((i) => i.id !== id)), 6500);
  }, []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast ${t.error ? "error" : ""}`}
            role={t.error ? "alert" : "status"}
          >
            {t.error ? <X size={17} /> : <Check size={17} />}
            <span>{t.text}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setToasts((s) => s.filter((i) => i.id !== t.id))}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export function useTask() {
  const toast = useToast(),
    [busy, setBusy] = useState(false);
  const run = async (task: () => Promise<unknown>, success?: string) => {
    if (busy) return false;
    setBusy(true);
    try {
      await task();
      if (success) toast(success);
      return true;
    } catch (error) {
      toast(message(error), true);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-box">
      <Search size={17} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
