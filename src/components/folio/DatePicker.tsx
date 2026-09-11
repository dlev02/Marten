import { useEffect, useId, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "@daypicker/react";
import { Select } from "./Select";
import { localDate } from "../../lib/format";
import {
  displayCalendarDate,
  parseCalendarInput,
  readCalendarDate,
} from "./dateInput";
import "@daypicker/react/style.css";
import "./datePicker.css";

export function DatePicker({
  value,
  onChange,
  label,
  disabled = false,
  required = false,
  min,
  max,
  placeholder = "MM/DD/YYYY",
  id,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  placeholder?: string;
  id?: string;
  className?: string;
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(displayCalendarDate(value));
  const [error, setError] = useState("");
  const [month, setMonth] = useState(
    () => readCalendarDate(value) ?? new Date(),
  );
  useEffect(() => {
    setDraft(displayCalendarDate(value));
    setError("");
    input.current?.setCustomValidity("");
  }, [value]);
  const minDate = readCalendarDate(min ?? "1900-01-01") ?? new Date(1900, 0, 1);
  const maxDate =
    readCalendarDate(max ?? "2100-12-31") ?? new Date(2100, 11, 31);
  const choose = (next: string) => {
    setDraft(displayCalendarDate(next));
    setError("");
    input.current?.setCustomValidity("");
    if (next !== value) onChange(next);
    setOpen(false);
  };
  const validateDraft = (text: string) => {
    const parsed = parseCalendarInput(text);
    const invalid =
      parsed === null ||
      (parsed !== "" &&
        ((min && parsed < min) ||
          (max && parsed > max) ||
          parsed < "1900-01-01" ||
          parsed > "2100-12-31"));
    if (invalid) {
      const reason =
        "Enter a valid date" +
        (min || max ? " within the allowed range." : " as MM/DD/YYYY.");
      setError(reason);
      input.current?.setCustomValidity(reason);
      return;
    }
    setError("");
    input.current?.setCustomValidity("");
    if (parsed !== value) onChange(parsed);
    setDraft(displayCalendarDate(parsed));
  };
  const changeMonth = (delta: number) =>
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1, 12));
  const today = localDate();
  return (
    <div className={`date-picker-field ${className}`}>
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          if (next) setMonth(readCalendarDate(value) ?? new Date());
          setOpen(next);
        }}
      >
        <Popover.Anchor asChild>
          <div className={`date-picker-input ${error ? "invalid" : ""}`}>
            <input
              ref={input}
              id={fieldId}
              aria-label={label}
              aria-invalid={!!error}
              aria-describedby={error ? `${fieldId}-error` : undefined}
              required={required}
              disabled={disabled}
              type="text"
              inputMode="numeric"
              placeholder={placeholder}
              value={draft}
              maxLength={10}
              onChange={(event) => {
                setDraft(event.target.value);
                setError("");
                input.current?.setCustomValidity("");
              }}
              onBlur={() => validateDraft(draft)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  validateDraft(draft);
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setMonth(readCalendarDate(value) ?? new Date());
                  setOpen(true);
                }
              }}
            />
            <Popover.Trigger asChild>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Choose ${label.toLowerCase()}`}
              >
                <CalendarDays size={17} />
              </button>
            </Popover.Trigger>
          </div>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            className="date-picker-menu"
            sideOffset={7}
            collisionPadding={12}
            align="start"
            aria-label={`${label} calendar`}
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              input.current?.focus();
            }}
          >
            <div className="date-picker-navigation">
              <Select
                aria-label="Calendar month"
                value={String(month.getMonth())}
                onValueChange={(next) =>
                  setMonth(new Date(month.getFullYear(), Number(next), 1, 12))
                }
                options={Array.from({ length: 12 }, (_, index) => ({
                  value: String(index),
                  label: new Date(2026, index, 1).toLocaleDateString("en-US", {
                    month: "long",
                  }),
                }))}
              />
              <Select
                aria-label="Calendar year"
                value={String(month.getFullYear())}
                onValueChange={(next) =>
                  setMonth(new Date(Number(next), month.getMonth(), 1, 12))
                }
                options={Array.from(
                  { length: maxDate.getFullYear() - minDate.getFullYear() + 1 },
                  (_, index) => ({
                    value: String(minDate.getFullYear() + index),
                    label: String(minDate.getFullYear() + index),
                  }),
                )}
              />
              <button
                type="button"
                aria-label="Previous month"
                disabled={
                  month.getFullYear() * 12 + month.getMonth() <=
                  minDate.getFullYear() * 12 + minDate.getMonth()
                }
                onClick={() => changeMonth(-1)}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                type="button"
                aria-label="Next month"
                disabled={
                  month.getFullYear() * 12 + month.getMonth() >=
                  maxDate.getFullYear() * 12 + maxDate.getMonth()
                }
                onClick={() => changeMonth(1)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
            <DayPicker
              mode="single"
              selected={readCalendarDate(value)}
              onSelect={(date) => date && choose(localDate(date))}
              month={month}
              onMonthChange={setMonth}
              hideNavigation
              showOutsideDays
              fixedWeeks
              autoFocus
              startMonth={minDate}
              endMonth={maxDate}
              disabled={[{ before: minDate }, { after: maxDate }]}
            />
            <div className="date-picker-footer">
              <button
                type="button"
                disabled={required || !value}
                onClick={() => choose("")}
              >
                Clear
              </button>
              <button
                type="button"
                disabled={
                  today < localDate(minDate) || today > localDate(maxDate)
                }
                onClick={() => choose(today)}
              >
                Today
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {error && (
        <small className="date-picker-error" id={`${fieldId}-error`}>
          {error}
        </small>
      )}
    </div>
  );
}
