import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AmountInput } from "../../components/folio/AmountInput";
import {
  useAmountsHidden,
  displayMoney as money,
} from "../../lib/amountVisibility";
import { CategoryIcon } from "../../components/folio/CategoryIcon";
import {
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { useAction, useMutation, useQuery } from "../../lib/convex";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Repeat2,
  Scissors,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { categoryOptions, merchantOptions, useData } from "../../lib/data";
import { message, parseMoney } from "../../lib/format";
import { DatePicker } from "../../components/folio/DatePicker";
import {
  Avatar,
  Button,
  Field,
  IconButton,
  Loading,
  Modal,
  Picker,
  useTask,
  useToast,
} from "../../components/folio/ui";
import { TagPicker } from "./TagPicker";
import { MerchantEditor } from "../settings/Organization";
import { useNotesDraft } from "./useNotesDraft";
import { RecurringEditor, type RecurringDraft } from "../Recurring";
import {
  matchesRecurringSchedule,
  recurringName,
} from "../../../convex/lib/recurring";
type RegisterFlush = (flush: () => Promise<boolean>) => () => void;
export function TransactionDrawer({
  id,
  onClose,
  previous,
  next,
}: {
  id: Id<"transactions"> | null;
  onClose: () => void;
  previous?: () => void;
  next?: () => void;
}) {
  useAmountsHidden();
  const detail = useQuery(api.transactions.detail, id ? { id } : "skip");
  const flushRef = useRef<(() => Promise<boolean>) | null>(null);
  const leavingRef = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const registerFlush: RegisterFlush = useCallback((flush) => {
    flushRef.current = flush;
    return () => {
      if (flushRef.current === flush) flushRef.current = null;
    };
  }, []);
  const leave = useCallback(async (action: () => void) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    try {
      if (!flushRef.current || (await flushRef.current())) action();
    } finally {
      leavingRef.current = false;
      setLeaving(false);
    }
  }, []);
  return (
    <Modal
      open={!!id}
      onClose={() => void leave(onClose)}
      title="Transaction details"
      drawer
    >
      {detail ? (
        <TransactionFields
          key={detail.transaction._id}
          detail={detail}
          onClose={onClose}
          previous={previous}
          next={next}
          registerFlush={registerFlush}
          leave={leave}
          leaving={leaving}
        />
      ) : (
        <Loading />
      )}
    </Modal>
  );
}
type Detail = {
  transaction: Doc<"transactions">;
  attachments: (Doc<"attachments"> & { url: string | null })[];
  activity: Doc<"activity">[];
};
function TransactionFields({
  detail,
  onClose,
  previous,
  next,
  registerFlush,
  leave,
  leaving,
}: {
  detail: Detail;
  onClose: () => void;
  previous?: () => void;
  next?: () => void;
  registerFlush: RegisterFlush;
  leave: (action: () => void) => Promise<void>;
  leaving: boolean;
}) {
  useAmountsHidden();
  const { transaction: tx } = detail,
    data = useData(),
    toast = useToast(),
    navigate = useNavigate(),
    update = useMutation(api.transactions.update),
    remove = useMutation(api.transactions.remove),
    upload = useAction(api.transactions.uploadAttachment),
    deleteAttachment = useMutation(api.transactions.deleteAttachment),
    saveMerchant = useMutation(api.settings.saveMerchant);
  const [saving, setSaving] = useState(0),
    [saveError, setSaveError] = useState<string | null>(null),
    [splitOpen, setSplitOpen] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false),
    [newMerchant, setNewMerchant] = useState(false),
    [merchantName, setMerchantName] = useState(""),
    [editingMerchant, setEditingMerchant] = useState(false);
  const [activityOpen, setActivityOpen] = useState(true);
  const [recurringDraft, setRecurringDraft] = useState<RecurringDraft | null>(
    null,
  );
  const matchingSchedules = useMemo(
    () =>
      data.recurring.filter((schedule) =>
        matchesRecurringSchedule(schedule, tx),
      ),
    [data.recurring, tx],
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const { busy, run } = useTask();
  const merchant = data.merchants.find((m) => m._id === tx.merchantId),
    account = data.accounts.find((a) => a._id === tx.accountId);
  const canEdit = !tx.pending || !!data.profile?.allowPending;
  const persistNotes = useCallback(
    async (notes: string) => {
      if (!canEdit)
        throw new Error(
          "Allow pending edits or wait until this transaction posts.",
        );
      await update({ id: tx._id, patch: { notes } });
    },
    [canEdit, tx._id, update],
  );
  const notes = useNotesDraft(tx.notes, persistNotes);
  useEffect(() => registerFlush(notes.flush), [notes.flush, registerFlush]);
  async function patch(
    fields: Partial<
      Pick<
        Doc<"transactions">,
        | "merchantId"
        | "categoryId"
        | "notes"
        | "tagIds"
        | "reviewed"
        | "hidden"
        | "date"
        | "amountCents"
        | "splits"
      >
    >,
  ) {
    if (!canEdit) {
      toast("Allow pending edits or wait until this transaction posts.", true);
      return false;
    }
    setSaving((n) => n + 1);
    setSaveError(null);
    try {
      await update({ id: tx._id, patch: fields });
      return true;
    } catch (error) {
      setSaveError(message(error));
      toast(message(error), true);
      return false;
    } finally {
      setSaving((n) => n - 1);
    }
  }
  async function fileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !canEdit) return;
    await run(async () => {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Choose a receipt up to 5 MB.");
      await upload({
        transactionId: tx._id,
        name: file.name,
        contentType: file.type,
        bytes: await file.arrayBuffer(),
      });
    }, "Receipt attached");
    event.target.value = "";
  }
  const setTag = (tagId: Id<"tags">) =>
    void patch({
      tagIds: tx.tagIds.includes(tagId)
        ? tx.tagIds.filter((id) => id !== tagId)
        : [...tx.tagIds, tagId],
    });
  return (
    <>
      <div className="transaction-drawer-actions">
        <Button
          icon={tx.reviewed ? <Check size={16} /> : <CheckCircle2 size={16} />}
          disabled={!canEdit}
          onClick={() => void patch({ reviewed: !tx.reviewed })}
          className={tx.reviewed ? "reviewed-button" : ""}
        >
          {tx.reviewed ? "Reviewed" : "Mark as reviewed"}
        </Button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <IconButton label="More transaction actions" disabled={!canEdit}>
              <MoreHorizontal size={18} />
            </IconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="small-menu transaction-more-menu"
              align="end"
              sideOffset={6}
            >
              <DropdownMenu.Item
                asChild
                onSelect={() => void patch({ hidden: !tx.hidden })}
              >
                <button type="button">
                  {tx.hidden ? <Eye size={16} /> : <EyeOff size={16} />}
                  {tx.hidden ? "Unhide transaction" : "Hide transaction"}
                </button>
              </DropdownMenu.Item>
              {tx.source !== "plaid" &&
                tx.source !== "simplefin" &&
                tx.source !== "lunchflow" && (
                  <DropdownMenu.Item
                    asChild
                    onSelect={() => setConfirmDelete(true)}
                  >
                    <button type="button" className="transaction-delete-action">
                      <Trash2 size={16} />
                      Delete transaction
                    </button>
                  </DropdownMenu.Item>
                )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      <div className="transaction-detail-hero">
        <Avatar
          name={merchant?.name ?? tx.originalName}
          logo={merchant?.resolvedLogoUrl}
          color={merchant?.color}
          size="large"
        />
        <div>
          <div
            className={`detail-amount ${tx.amountCents < 0 ? "positive" : ""}`}
          >
            {tx.amountCents < 0 ? "+" : ""}
            {money(Math.abs(tx.amountCents), true, account?.currency ?? "USD")}
          </div>
          <p>
            {account?.name}
            {account?.mask ? ` · ${account.mask}` : ""}
          </p>
          {tx.pending && <span className="status-chip">Pending</span>}
        </div>
      </div>
      {tx.splitDraft && tx.splitDraft.length > 0 && (
        <div className="inline-notice warning">
          The posted amount changed. Review your saved split allocations.
          <button
            className="text-link"
            disabled={!canEdit}
            onClick={() => setSplitOpen(true)}
          >
            Review split
          </button>
        </div>
      )}
      {!canEdit && (
        <div className="inline-notice">
          Pending transactions can be edited after they post. You can allow
          pending edits in Preferences.
        </div>
      )}
      <div className="transaction-detail-body">
        <Picker
          label="Merchant"
          disabled={!canEdit}
          value={tx.merchantId}
          options={[
            ...merchantOptions(data),
            { value: "__new", label: "+ Create merchant" },
          ]}
          onChange={(id) =>
            id === "__new"
              ? setNewMerchant(true)
              : void patch({ merchantId: id as Id<"merchants"> })
          }
        />
        <div className="merchant-links">
          <Link
            to={`/transactions?merchant=${tx.merchantId}`}
            className="text-link merchant-transactions-link"
            onClick={(event) => {
              event.preventDefault();
              void leave(() => {
                onClose();
                void navigate(`/transactions?merchant=${tx.merchantId}`);
              });
            }}
          >
            View {merchant?.transactionCount ?? 0}{" "}
            {merchant?.transactionCount === 1 ? "transaction" : "transactions"}
          </Link>
          {merchant && (
            <button
              type="button"
              className="text-link merchant-transactions-link"
              disabled={!canEdit}
              onClick={() => setEditingMerchant(true)}
            >
              <Pencil size={12} />
              Edit merchant
            </button>
          )}
        </div>
        <div className="original-statement">
          <span>Original statement</span>
          <div>
            <p>{tx.originalName}</p>
            <IconButton
              label="Copy original statement"
              onClick={() =>
                void navigator.clipboard
                  .writeText(tx.originalName)
                  .then(() => toast("Statement copied"))
                  .catch(() => toast("Couldn’t access the clipboard.", true))
              }
            >
              <Copy size={16} />
            </IconButton>
          </div>
        </div>
        <div className="date-field">
          <label htmlFor={`date-${tx._id}`}>Date</label>
          <DatePicker
            id={`date-${tx._id}`}
            label="Transaction date"
            value={tx.date}
            disabled={
              tx.source === "plaid" ||
              tx.source === "simplefin" ||
              tx.source === "lunchflow" ||
              !canEdit
            }
            required
            onChange={(value) => void patch({ date: value })}
          />
        </div>
        <div className="category-field">
          <div className="field-label">
            <label>Category</label>
            <button
              className="text-link"
              disabled={!canEdit}
              onClick={() => setSplitOpen(true)}
            >
              <Scissors size={13} />
              {tx.splits.length ? "Edit split" : "Split"}
            </button>
          </div>
          <Picker
            label="Transaction category"
            disabled={!canEdit}
            value={tx.categoryId}
            options={categoryOptions(data)}
            onChange={(id) =>
              void patch({ categoryId: id as Id<"categories">, splits: [] })
            }
          />
          {tx.splits.length > 0 && (
            <div className="split-preview">
              {tx.splits.map((s, i) => (
                <div key={i}>
                  <span>
                    <CategoryIcon
                      emoji={
                        data.categories.find((c) => c._id === s.categoryId)
                          ?.emoji
                      }
                    />{" "}
                    {data.categories.find((c) => c._id === s.categoryId)?.name}
                  </span>
                  <strong>{money(s.amountCents)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
        <Field label="Notes">
          <textarea
            aria-label="Transaction notes"
            value={notes.value}
            disabled={!canEdit}
            maxLength={5000}
            onChange={(e) => notes.setValue(e.target.value)}
            onBlur={() => void notes.flush()}
            placeholder="Add a note…"
            rows={3}
          />
          {notes.error && (
            <p className="inline-notice warning" role="alert">
              {notes.error} Your note is still here.{" "}
              <button className="text-link" onClick={() => void notes.flush()}>
                Retry save
              </button>
            </p>
          )}
        </Field>
        <Field label="Tags">
          <div className="tag-editor">
            {tx.tagIds.map((id) => {
              const tag = data.tags.find((t) => t._id === id);
              return (
                tag && (
                  <span
                    key={id}
                    className="tag-chip"
                    style={{ background: tag.color + "35" }}
                  >
                    {tag.name}
                    <button
                      aria-label={`Remove ${tag.name} tag`}
                      disabled={!canEdit}
                      onClick={() => setTag(id)}
                    >
                      <X size={12} />
                    </button>
                  </span>
                )
              );
            })}
            <TagPicker
              selected={tx.tagIds}
              disabled={!canEdit}
              onSelect={async (id) => {
                if (
                  !(await patch({ tagIds: [...new Set([...tx.tagIds, id])] }))
                )
                  throw new Error("The tag could not be applied. Try again.");
              }}
            />
          </div>
        </Field>
        <Field label="Attachments">
          <div className="attachment-list">
            {detail.attachments.map((a) => (
              <div key={a._id}>
                <FileText size={19} />
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer">
                    {a.name}
                    <small>{Math.ceil(a.size / 1024)} KB</small>
                  </a>
                ) : (
                  <span>{a.name} · unavailable</span>
                )}
                <IconButton
                  label={`Delete ${a.name}`}
                  disabled={!canEdit || busy}
                  onClick={() =>
                    void run(
                      () => deleteAttachment({ id: a._id }),
                      "Attachment deleted",
                    )
                  }
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
            ))}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="sr-only"
            aria-label="Upload receipt"
            disabled={!canEdit || busy}
            onChange={(e) => void fileChange(e)}
          />
          <button
            className="attachment-dropzone"
            disabled={!canEdit || busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="spin" size={19} />
            ) : (
              <Paperclip size={19} />
            )}
            <span>{busy ? "Uploading…" : "Add an attachment"}</span>
          </button>
          <small className="muted">JPEG, PNG, WebP, or PDF · up to 5 MB</small>
        </Field>
        <div className="original-statement recurring-section">
          <span>Recurring schedule</span>
          <div className="recurring-section-body">
            {matchingSchedules.length > 0 ? (
              <>
                {matchingSchedules.length > 1 && (
                  <p className="muted">
                    More than one schedule matches. Review their amounts or
                    statement filters.
                  </p>
                )}
                {matchingSchedules.map((schedule) => (
                  <Button
                    key={schedule._id}
                    icon={<Repeat2 size={15} />}
                    onClick={() => setRecurringDraft(schedule)}
                  >
                    {recurringName(schedule, merchant?.name)}
                  </Button>
                ))}
                <small className="muted">
                  Matches this schedule’s details. Payment checkmarks are
                  managed in Recurring.
                </small>
              </>
            ) : (
              <small className="muted">
                This transaction doesn’t match a recurring schedule.
              </small>
            )}
            <Button
              icon={<Plus size={15} />}
              disabled={
                tx.pending ||
                tx.hidden ||
                !!tx.removedFromBank ||
                tx.amountCents === 0
              }
              onClick={() =>
                setRecurringDraft({
                  merchantId: tx.merchantId,
                  accountId: tx.accountId,
                  categoryId: tx.categoryId,
                  name: merchant?.name ?? tx.originalName,
                  amountCents: tx.amountCents,
                  amountToleranceCents: 0,
                  statementContains: "",
                  frequency: "monthly",
                  nextDate: tx.date,
                  active: true,
                  source: "manual",
                  note: "",
                })
              }
            >
              Create a schedule from this transaction
            </Button>
          </div>
        </div>
        <section className="activity">
          <button
            onClick={() => setActivityOpen(!activityOpen)}
            aria-expanded={activityOpen}
          >
            <h3>Activity</h3>
            <ChevronDown size={17} className={activityOpen ? "rotated" : ""} />
          </button>
          {activityOpen && (
            <ol>
              {detail.activity.length ? (
                detail.activity.map((a) => (
                  <li key={a._id}>
                    <span />
                    <div>
                      {a.message}
                      <small>
                        {new Date(a._creationTime).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </small>
                    </div>
                  </li>
                ))
              ) : (
                <li>
                  <span />
                  <div>
                    {tx.source === "plaid" ||
                    tx.source === "simplefin" ||
                    tx.source === "lunchflow"
                      ? "Transaction imported"
                      : "Transaction added"}
                    <small>
                      {new Date(tx._creationTime).toLocaleDateString()}
                    </small>
                  </div>
                </li>
              )}
            </ol>
          )}
        </section>
      </div>
      <footer className="drawer-footer">
        <Button
          icon={<ArrowLeft size={15} />}
          disabled={!previous || leaving}
          onClick={() => previous && void leave(previous)}
        >
          Previous
        </Button>
        <span className="save-status" role="status" aria-live="polite">
          {saving || notes.status === "saving" ? (
            <>
              <Loader2 size={12} className="spin" />
              Saving…
            </>
          ) : notes.error || saveError ? (
            <span className="negative">Couldn’t save</span>
          ) : notes.dirty ? (
            <span>Unsaved changes</span>
          ) : (
            <>
              <Check size={12} />
              Saved
            </>
          )}
        </span>
        <Button
          disabled={!next || leaving}
          onClick={() => next && void leave(next)}
        >
          Next
          <ArrowRight size={15} />
        </Button>
      </footer>
      {splitOpen && (
        <SplitTransaction
          key={tx._id}
          onClose={() => setSplitOpen(false)}
          tx={tx}
          save={(splits) => patch({ splits })}
        />
      )}
      {recurringDraft && (
        <RecurringEditor
          initial={recurringDraft}
          onClose={() => setRecurringDraft(null)}
        />
      )}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete transaction?"
        description="This removes the transaction and its attachments. This cannot be undone."
      >
        <div className="modal-actions">
          <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button
            tone="danger"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (!(await notes.flush()))
                  throw new Error(
                    "Your note could not be saved. Try again before deleting.",
                  );
                await remove({ id: tx._id });
                onClose();
              }, "Transaction deleted")
            }
          >
            Delete transaction
          </Button>
        </div>
      </Modal>
      {editingMerchant && merchant && (
        <MerchantEditor
          merchant={merchant}
          onClose={() => setEditingMerchant(false)}
        />
      )}
      <Modal
        open={newMerchant}
        onClose={() => setNewMerchant(false)}
        title="Create merchant"
      >
        <label>
          Merchant name
          <input
            value={merchantName}
            onChange={(e) => setMerchantName(e.target.value)}
            placeholder="e.g. Neighborhood Market"
          />
        </label>
        <div className="modal-actions">
          <Button onClick={() => setNewMerchant(false)}>Cancel</Button>
          <Button
            tone="primary"
            disabled={busy || !canEdit || !merchantName.trim()}
            onClick={() =>
              void run(async () => {
                const id = await saveMerchant({
                  name: merchantName,
                  color: "#648981",
                });
                if (!(await patch({ merchantId: id })))
                  throw new Error(
                    "Merchant created, but the transaction could not be updated.",
                  );
                setNewMerchant(false);
                setMerchantName("");
              }, "Merchant created")
            }
          >
            Create merchant
          </Button>
        </div>
      </Modal>
    </>
  );
}
function SplitTransaction({
  onClose,
  tx,
  save,
}: {
  onClose: () => void;
  tx: Doc<"transactions">;
  save: (splits: Doc<"transactions">["splits"]) => Promise<boolean>;
}) {
  useAmountsHidden();
  const data = useData(),
    [rows, setRows] = useState<
      { categoryId: string; amount: string; note: string }[]
    >(() => {
      const initial = tx.splitDraft?.length ? tx.splitDraft : tx.splits;
      return initial.length
        ? initial.map((s) => ({
            categoryId: s.categoryId,
            amount: (s.amountCents / 100).toFixed(2),
            note: s.note ?? "",
          }))
        : [
            {
              categoryId: tx.categoryId,
              amount: (tx.amountCents / 100).toFixed(2),
              note: "",
            },
            { categoryId: tx.categoryId, amount: "0.00", note: "" },
          ];
    }),
    [busy, setBusy] = useState(false),
    toast = useToast();
  const total = rows.reduce((sum, r) => {
      try {
        return sum + parseMoney(r.amount);
      } catch {
        return sum;
      }
    }, 0),
    remaining = tx.amountCents - total;
  function change(index: number, patch: Partial<(typeof rows)[number]>) {
    setRows((s) => s.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Split transaction"
      description="Give each part its own category. The amounts must match the original total."
    >
      <div className="split-total">
        <span>Transaction total</span>
        <strong>{money(tx.amountCents)}</strong>
      </div>
      <div className="split-rows">
        {rows.map((row, index) => (
          <div key={index} className="split-row">
            <span className="split-number">{index + 1}</span>
            <div>
              <Picker
                label={`Split ${index + 1} category`}
                value={row.categoryId}
                options={categoryOptions(data)}
                onChange={(id) => change(index, { categoryId: id })}
              />
              <input
                aria-label={`Split ${index + 1} note`}
                value={row.note}
                onChange={(e) => change(index, { note: e.target.value })}
                placeholder="Add a note (optional)"
              />
            </div>
            <AmountInput
              aria-label={`Split ${index + 1} amount`}
              className="split-amount"
              value={row.amount}
              inputMode="decimal"
              onChange={(e) => change(index, { amount: e.target.value })}
            />
            <IconButton
              label={`Remove split ${index + 1}`}
              disabled={rows.length <= 2}
              onClick={() => setRows((s) => s.filter((_, i) => i !== index))}
            >
              <X size={15} />
            </IconButton>
          </div>
        ))}
      </div>
      <Button
        tone="quiet"
        icon={<Plus size={15} />}
        onClick={() =>
          setRows((s) => [
            ...s,
            {
              categoryId: tx.categoryId,
              amount: (remaining / 100).toFixed(2),
              note: "",
            },
          ])
        }
        disabled={rows.length >= 50}
      >
        Add another split
      </Button>
      <div
        className={`split-remaining ${remaining === 0 ? "positive" : "negative"}`}
      >
        <span>Left to split</span>
        <strong>{money(remaining)}</strong>
      </div>
      <div className="modal-actions">
        <Button
          tone="quiet"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void save([])
              .then((ok) => ok && onClose())
              .finally(() => setBusy(false));
          }}
        >
          Remove split
        </Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          tone="primary"
          disabled={busy || remaining !== 0}
          onClick={() => {
            try {
              const splits = rows.map((r) => ({
                categoryId: r.categoryId as Id<"categories">,
                amountCents: parseMoney(r.amount),
                note: r.note || undefined,
              }));
              setBusy(true);
              void save(splits)
                .then((ok) => ok && onClose())
                .finally(() => setBusy(false));
            } catch (e) {
              toast(message(e), true);
            }
          }}
        >
          Save split
        </Button>
      </div>
    </Modal>
  );
}
