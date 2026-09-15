import { useState } from "react";
import { X } from "lucide-react";
import { useMutation } from "../../lib/convex";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { categoryOptions, merchantOptions, useData } from "../../lib/data";
import {
  Button,
  Field,
  Modal,
  Picker,
  useTask,
} from "../../components/folio/ui";
import { Select } from "../../components/folio/Select";
import { DatePicker } from "../../components/folio/DatePicker";
import { TagPicker } from "./TagPicker";

type Update = FunctionArgs<typeof api.transactions.bulkUpdate>;
export function BulkTransactions({
  transactions,
  onClose,
  onSaved,
}: {
  transactions: Doc<"transactions">[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const data = useData(),
    task = useTask();
  const update = useMutation(api.transactions.bulkUpdate),
    remove = useMutation(api.transactions.bulkRemove);
  const [merchant, setMerchant] = useState(""),
    [category, setCategory] = useState("");
  const [date, setDate] = useState(""),
    [visibility, setVisibility] = useState(""),
    [review, setReview] = useState("");
  const [noteMode, setNoteMode] = useState(""),
    [notes, setNotes] = useState("");
  const [tagMode, setTagMode] = useState(""),
    [tags, setTags] = useState<Id<"tags">[]>([]);
  const [frequency, setFrequency] = useState(""),
    [confirmDelete, setConfirmDelete] = useState(false);
  const bankManaged = transactions.some(
    (tx) =>
      tx.source === "plaid" ||
      tx.source === "simplefin" ||
      tx.source === "lunchflow",
  );
  const pendingLocked =
    transactions.some((tx) => tx.pending) && !data.profile?.allowPending;
  const changed = !!(
    merchant ||
    category ||
    date ||
    visibility ||
    review ||
    noteMode ||
    tagMode ||
    frequency
  );
  const choices = (yes: string, no: string) => [
    { value: "", label: "No change" },
    { value: "yes", label: yes },
    { value: "no", label: no },
  ];
  return (
    <>
      <Modal
        open
        className="bulk-transaction-modal"
        onClose={() => {
          if (!task.busy) onClose();
        }}
        title={`Edit ${transactions.length} ${transactions.length === 1 ? "transaction" : "transactions"}`}
        description="Only the fields you change will be applied to every selected transaction."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void task.run(async () => {
              const patch: Update["patch"] = {};
              if (merchant) patch.merchantId = merchant as Id<"merchants">;
              if (category) {
                patch.categoryId = category as Id<"categories">;
                patch.splits = [];
              }
              if (date) patch.date = date;
              if (visibility) patch.hidden = visibility === "yes";
              if (review) patch.reviewed = review === "yes";
              if (noteMode) patch.notes = noteMode === "clear" ? "" : notes;
              await update({
                ids: transactions.map((tx) => tx._id),
                patch,
                ...(tagMode
                  ? {
                      tagChange: {
                        mode: tagMode as "add" | "remove" | "replace",
                        ids: tags,
                      },
                    }
                  : {}),
                ...(frequency
                  ? {
                      recurringFrequency:
                        frequency as Update["recurringFrequency"],
                    }
                  : {}),
              });
              onSaved();
            }, "Transactions updated");
          }}
        >
          <div className="form-stack">
            {pendingLocked && (
              <p className="muted">
                Some selected transactions are pending. Enable pending edits in
                Preferences or wait until they post.
              </p>
            )}
            <Field label="Merchant">
              <Picker
                label="Bulk merchant"
                value={merchant}
                placeholder="No change"
                onChange={setMerchant}
                options={[
                  { value: "", label: "No change" },
                  ...merchantOptions(data),
                ]}
              />
            </Field>
            <Field
              label="Category"
              hint={
                category && transactions.some((tx) => tx.splits.length)
                  ? "This replaces existing split allocations with one category."
                  : undefined
              }
            >
              <Picker
                label="Bulk category"
                value={category}
                placeholder="No change"
                onChange={setCategory}
                options={[
                  { value: "", label: "No change" },
                  ...categoryOptions(data),
                ]}
              />
            </Field>
            <Field
              label="Date"
              hint={
                bankManaged
                  ? "Bank dates are managed by your connection. Select only manual or imported transactions to change dates."
                  : "Leave blank to keep the original dates."
              }
            >
              <DatePicker
                label="Bulk date"
                value={date}
                onChange={setDate}
                disabled={bankManaged}
              />
            </Field>
            <div className="form-grid">
              <Field label="Visibility">
                <Select
                  aria-label="Bulk visibility"
                  value={visibility}
                  onValueChange={setVisibility}
                  options={choices("Hide from reports", "Show in reports")}
                />
              </Field>
              <Field label="Review status">
                <Select
                  aria-label="Bulk review status"
                  value={review}
                  onValueChange={setReview}
                  options={choices("Reviewed", "Needs review")}
                />
              </Field>
            </div>
            <Field label="Notes">
              <Select
                aria-label="Bulk notes"
                value={noteMode}
                onValueChange={setNoteMode}
                options={[
                  { value: "", label: "No change" },
                  { value: "replace", label: "Replace notes" },
                  { value: "clear", label: "Clear notes" },
                ]}
              />
              {noteMode === "replace" && (
                <textarea
                  aria-label="Replacement notes"
                  maxLength={5000}
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              )}
            </Field>
            <Field
              label="Tags"
              hint={
                tagMode === "replace" && !tags.length
                  ? "All existing tags will be removed."
                  : undefined
              }
            >
              <Select
                aria-label="Bulk tags"
                value={tagMode}
                onValueChange={setTagMode}
                options={[
                  { value: "", label: "No change" },
                  { value: "add", label: "Add tags" },
                  { value: "remove", label: "Remove tags" },
                  { value: "replace", label: "Replace all tags" },
                ]}
              />
              {tagMode && (
                <div className="tag-editor">
                  {tags.map((id) => (
                    <Button
                      key={id}
                      onClick={() => setTags(tags.filter((tag) => tag !== id))}
                      aria-label={`Remove ${data.tags.find((tag) => tag._id === id)?.name} from selection`}
                    >
                      {data.tags.find((tag) => tag._id === id)?.name}
                      <X size={13} />
                    </Button>
                  ))}
                  <TagPicker
                    selected={tags}
                    onSelect={(id) =>
                      setTags((current) => [...new Set([...current, id])])
                    }
                  />
                </div>
              )}
            </Field>
            <Field
              label="Recurring"
              hint={
                frequency
                  ? "Create a schedule for each distinct merchant, account and amount. Matching active schedules are kept."
                  : undefined
              }
            >
              <Select
                aria-label="Bulk recurring"
                value={frequency}
                onValueChange={setFrequency}
                options={[
                  { value: "", label: "No change" },
                  ...[
                    ["weekly", "Weekly"],
                    ["biweekly", "Every two weeks"],
                    ["monthly", "Monthly"],
                    ["quarterly", "Quarterly"],
                    ["yearly", "Yearly"],
                  ].map(([value, label]) => ({ value, label })),
                ]}
              />
            </Field>
            {bankManaged && (
              <p className="muted">
                Bank transactions can be hidden from reports. Deletion is
                available when only manual or imported transactions are
                selected.
              </p>
            )}
          </div>
          <div className="modal-actions">
            <Button
              tone="danger"
              disabled={task.busy || bankManaged}
              onClick={() => setConfirmDelete(true)}
            >
              Delete selected
            </Button>
            <Button disabled={task.busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              tone="primary"
              disabled={
                task.busy ||
                !changed ||
                pendingLocked ||
                ((tagMode === "add" || tagMode === "remove") && !tags.length)
              }
            >
              Apply changes
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={confirmDelete}
        onClose={() => {
          if (!task.busy) setConfirmDelete(false);
        }}
        title={`Delete ${transactions.length} ${transactions.length === 1 ? "transaction" : "transactions"}?`}
        description="These transactions, their notes and attachments will be permanently removed. This cannot be undone."
      >
        <div className="modal-actions">
          <Button disabled={task.busy} onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button
            tone="danger"
            disabled={task.busy}
            onClick={() =>
              void task.run(async () => {
                await remove({ ids: transactions.map((tx) => tx._id) });
                onSaved();
              }, "Transactions deleted")
            }
          >
            Delete transactions
          </Button>
        </div>
      </Modal>
    </>
  );
}
