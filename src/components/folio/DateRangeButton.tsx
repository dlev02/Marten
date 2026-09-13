import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays } from "lucide-react";
import { Button } from "./ui";
import { DatePicker } from "./DatePicker";
import { dateRangeLabel, type DatePreset } from "../../lib/dateRanges";

/**
 * One control for a date range: common presets first, then a custom
 * from/through pair. Shared by Transactions and Reports so both pages read
 * the same way; pass `required` when an open-ended range is not allowed.
 */
export function DateRangeButton({
  from,
  to,
  presets,
  onChange,
  emptyLabel = "Date",
  required = false,
  maxDate,
  align = "end",
}: {
  from: string;
  to: string;
  presets: DatePreset[];
  onChange: (from: string, to: string) => void;
  /** Trigger text when neither end is set. */
  emptyLabel?: string;
  /** Keep both ends set; the trigger reads as active once a range exists. */
  required?: boolean;
  maxDate?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const active = required ? false : !!(from || to);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          icon={<CalendarDays size={16} />}
          className={active ? "filter-active" : ""}
          aria-label={`Date range: ${dateRangeLabel(from, to, presets, emptyLabel)}`}
        >
          {dateRangeLabel(from, to, presets, emptyLabel)}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="filter-popover date-range-popover"
          align={align}
          sideOffset={8}
        >
          <h3>Date range</h3>
          <div
            className="date-range-presets"
            role="group"
            aria-label="Common date ranges"
          >
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                aria-pressed={from === preset.from && to === preset.to}
                onClick={() => {
                  onChange(preset.from, preset.to);
                  setOpen(false);
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="date-range-custom-label">Custom range</p>
          <label>
            From
            <DatePicker
              value={from}
              onChange={(value) => onChange(value, to)}
              label="From date"
              max={to || maxDate}
              required={required}
            />
          </label>
          <label>
            Through
            <DatePicker
              value={to}
              onChange={(value) => onChange(from, value)}
              label="Through date"
              min={from || undefined}
              max={maxDate}
              required={required}
            />
          </label>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
