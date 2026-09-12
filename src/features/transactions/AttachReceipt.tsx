import {
  useAmountsHidden,
  displayMoney as money,
} from "../../lib/amountVisibility";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAction } from "convex/react";
import { FileCheck2, Paperclip } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { txMerchant, useData, useTransactions } from "../../lib/data";
import { dateLabel } from "../../lib/format";
import {
  Button,
  Field,
  Modal,
  SearchBox,
  useTask,
} from "../../components/folio/ui";
import "./import.css";

/**
 * Attaches a receipt to a transaction that already exists: choose the file,
 * find the purchase, and save. The transaction drawer is the place to manage
 * receipts afterwards, so the caller opens it once the upload finishes.
 */
export function AttachReceipt({
  open,
  onClose,
  onAttached,
}: {
  open: boolean;
  onClose: () => void;
  onAttached: (transactionId: Id<"transactions">) => void;
}) {
  useAmountsHidden();
  const data = useData();
  const upload = useAction(api.transactions.uploadAttachment);
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<Id<"transactions"> | null>(null);
  const { busy, run } = useTask();
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 200);
    return () => clearTimeout(timer);
  }, [search]);
  const result = useTransactions({ search: debounced || undefined });
  const candidates = useMemo(
    () =>
      // Search results arrive by relevance; newest-first is easier to scan.
      result.results
        .filter((tx) => !tx.hidden && !tx.removedFromBank)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 30),
    [result.results],
  );
  function choose(next?: File) {
    if (!next) return;
    setFile(next);
  }
  async function save() {
    if (!file || !selected) return;
    const id = selected;
    const done = await run(async () => {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Choose a receipt up to 5 MB.");
      await upload({
        transactionId: id,
        name: file.name,
        contentType: file.type,
        bytes: await file.arrayBuffer(),
      });
    }, "Receipt attached");
    if (done) {
      setFile(null);
      setSelected(null);
      setSearch("");
      onAttached(id);
    }
  }
  function label(tx: Doc<"transactions">) {
    return txMerchant(tx, data)?.name ?? tx.originalName;
  }
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Attach a receipt"
      description="Pick the file, then the transaction it belongs to."
    >
      <div className="transaction-import attach-receipt">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          ref={fileInput}
          className="sr-only"
          aria-label="Choose receipt file"
          onChange={(event) => {
            choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <button
          className="attachment-dropzone"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          {file ? <FileCheck2 size={21} /> : <Paperclip size={21} />}
          <span>{file?.name ?? "Choose a receipt"}</span>
          <small>JPEG, PNG, WebP, or PDF · up to 5 MB</small>
        </button>
        <Field label="Transaction">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search by merchant, description, or note…"
          />
        </Field>
        <div
          className="attach-receipt-list"
          role="listbox"
          aria-label="Matching transactions"
        >
          {candidates.map((tx) => (
            <button
              key={tx._id}
              type="button"
              role="option"
              aria-selected={selected === tx._id}
              className={selected === tx._id ? "selected" : ""}
              disabled={busy}
              onClick={() => setSelected(tx._id)}
            >
              <span className="attach-receipt-date">
                {dateLabel(tx.date, { month: "short", day: "numeric" })}
              </span>
              <span className="attach-receipt-name">
                <strong>{label(tx)}</strong>
                <small>
                  {data.accounts.find((a) => a._id === tx.accountId)?.name}
                  {(tx.attachmentCount ?? 0) > 0
                    ? ` · ${tx.attachmentCount} attached`
                    : ""}
                </small>
              </span>
              <span className="attach-receipt-amount">
                {money(tx.amountCents)}
              </span>
            </button>
          ))}
          {!candidates.length && (
            <p className="import-hint">
              {result.status === "LoadingFirstPage"
                ? "Loading transactions…"
                : "No transactions match. Try a different search."}
            </p>
          )}
        </div>
        <div className="modal-actions">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            tone="primary"
            disabled={busy || !file || !selected}
            onClick={() => void save()}
          >
            {busy ? "Attaching…" : "Attach receipt"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
