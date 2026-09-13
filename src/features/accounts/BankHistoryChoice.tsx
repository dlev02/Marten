import { useState } from "react";
import { localDate } from "../../lib/format";
import { Field } from "../../components/folio/ui";
import { Select } from "../../components/folio/Select";
import { DatePicker } from "../../components/folio/DatePicker";

/** A date cutover only affects new transactions; balances and saved history stay intact. */
export function BankHistoryChoice({
  value,
  onChange,
  disabled,
  availableFrom,
  importedHistory = [],
  maxDate,
}: {
  value?: string;
  onChange: (date: string | undefined) => void;
  disabled?: boolean;
  availableFrom?: string;
  importedHistory?: {
    accountId: string;
    accountName: string;
    fromDate: string;
  }[];
  maxDate?: string;
}) {
  const today = localDate();
  const [mode, setMode] = useState(() =>
    importedHistory.length === 1 && value === importedHistory[0].fromDate
      ? `history:${importedHistory[0].accountId}`
      : value
        ? "custom"
        : "all",
  );
  const selectedHistory = importedHistory.find(
    (row) => `history:${row.accountId}` === mode,
  );
  return (
    <div className="bank-history-choice">
      <Field label="Transaction history">
        <Select
          aria-label="Transaction history"
          value={mode}
          disabled={disabled}
          options={[
            ...importedHistory.map((row) => ({
              value: `history:${row.accountId}`,
              label:
                importedHistory.length === 1
                  ? "After spreadsheet history"
                  : `After ${row.accountName} history`,
            })),
            {
              value: "all",
              label: availableFrom
                ? "Available history (up to five years)"
                : "Available history",
            },
            { value: "today", label: "From today" },
            { value: "custom", label: "Choose a start date" },
          ]}
          onValueChange={(next) => {
            setMode(next);
            onChange(
              next.startsWith("history:")
                ? importedHistory.find(
                    (row) => `history:${row.accountId}` === next,
                  )?.fromDate
                : next === "all"
                  ? availableFrom
                  : next === "today"
                    ? today
                    : (value ?? today),
            );
          }}
        />
      </Field>
      {mode === "custom" && (
        <Field label="First date to import">
          <DatePicker
            label="First date to import"
            value={value ?? today}
            onChange={onChange}
            min={availableFrom ?? "1900-01-01"}
            max={maxDate ?? today}
            required
            disabled={disabled}
          />
        </Field>
      )}
      <p className="import-hint">
        {selectedHistory && (
          <>Keep {selectedHistory.accountName} as your history. </>
        )}
        {mode === "all"
          ? "Includes the history your bank makes available."
          : `Import transactions dated ${value ?? today} and later.`}{" "}
        Current balances still connect. Saved transactions are not removed.
        {!selectedHistory && (
          <>
            {" "}
            If you imported a spreadsheet, choose the day after its last
            expense.
          </>
        )}
      </p>
      {selectedHistory && (
        <p className="import-hint">
          This date applies to all accounts you select. Their spreadsheet
          history should end on the same date.
        </p>
      )}
    </div>
  );
}
