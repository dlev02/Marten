import { AmountInput } from "../../components/folio/AmountInput";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation } from "../../lib/convex";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  accountOptions,
  categoryOptions,
  merchantOptions,
  useData,
} from "../../lib/data";
import { localDate, parseMoney } from "../../lib/format";
import { DatePicker } from "../../components/folio/DatePicker";
import {
  Button,
  Empty,
  Field,
  Modal,
  Picker,
  Tabs,
  useTask,
} from "../../components/folio/ui";
export function NewTransaction({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: Id<"transactions">) => void;
}) {
  const data = useData(),
    create = useMutation(api.transactions.create),
    saveMerchant = useMutation(api.settings.saveMerchant),
    { run, busy } = useTask();
  const [kind, setKind] = useState("expense"),
    [merchantId, setMerchantId] = useState(""),
    [merchantName, setMerchantName] = useState(""),
    [accountId, setAccountId] = useState(""),
    [categoryId, setCategoryId] = useState(""),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(localDate()),
    [notes, setNotes] = useState("");
  const wasOpen = useRef(false);
  useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (opening) {
      setKind("expense");
      setAccountId(data.accounts.find((a) => !a.closed)?._id ?? "");
      setCategoryId(
        data.categories.find(
          (c) =>
            c.enabled &&
            data.groups.find((g) => g._id === c.groupId)?.kind === "expense",
        )?._id ?? "",
      );
      setMerchantId("");
      setMerchantName("");
      setAmount("");
      setNotes("");
      setDate(localDate());
    }
  }, [open, data.accounts, data.categories, data.groups]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const absolute = parseMoney(amount);
      if (absolute < 0)
        throw new Error(
          "Enter a positive amount, then choose expense or income.",
        );
      const name =
        merchantId && merchantId !== "__new"
          ? (data.merchants.find((m) => m._id === merchantId)?.name ??
            merchantName)
          : merchantName;
      const merchant =
        merchantId && merchantId !== "__new"
          ? (merchantId as Id<"merchants">)
          : await saveMerchant({ name: name.trim(), color: "#668c85" });
      const id = await create({
        accountId: accountId as Id<"accounts">,
        merchantId: merchant,
        categoryId: categoryId as Id<"categories">,
        date,
        amountCents: kind === "income" ? -absolute : absolute,
        originalName: name,
        notes,
        tagIds: [],
        reviewed: true,
        hidden: false,
        pending: false,
        splits: [],
      });
      onClose();
      onCreated(id);
    }, "Transaction added");
  }
  return (
    <Modal open={open} onClose={onClose} title="Add transaction">
      {!data.accounts.length ? (
        <Empty
          title="Add an account first"
          description="Every transaction belongs to an account. You can create a manual account from Accounts."
        />
      ) : (
        <form onSubmit={(e) => void submit(e)}>
          <Tabs
            pill
            value={kind}
            onChange={(k) => {
              setKind(k);
              setCategoryId(
                data.categories.find(
                  (c) =>
                    c.enabled &&
                    data.groups.find((g) => g._id === c.groupId)?.kind === k,
                )?._id ?? categoryId,
              );
            }}
            items={[
              { value: "expense", label: "Expense" },
              { value: "income", label: "Income" },
              { value: "transfer", label: "Transfer" },
            ]}
          />
          <div className="form-stack">
            <Field label="Merchant">
              <Picker
                label="New transaction merchant"
                value={merchantId}
                options={[
                  ...merchantOptions(data),
                  { value: "__new", label: "+ Create merchant" },
                ]}
                onChange={setMerchantId}
                placeholder="Select a merchant"
              />
              {(!merchantId || merchantId === "__new") && (
                <input
                  aria-label="New merchant name"
                  value={merchantName}
                  onChange={(e) => setMerchantName(e.target.value)}
                  placeholder="Or enter a new merchant"
                  required
                />
              )}
            </Field>
            <div className="form-grid">
              <label>
                Amount
                <AmountInput
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  required
                />
              </label>
              <label>
                Date
                <DatePicker
                  label="Transaction date"
                  value={date}
                  onChange={setDate}
                  required
                />
              </label>
            </div>
            <Field label="Account">
              <Picker
                label="New transaction account"
                value={accountId}
                options={accountOptions(data)}
                onChange={setAccountId}
              />
            </Field>
            <Field label="Category">
              <Picker
                label="New transaction category"
                value={categoryId}
                options={categoryOptions(data)}
                onChange={setCategoryId}
              />
            </Field>
            <label>
              Notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add a note (optional)"
                rows={3}
              />
            </label>
          </div>
          <div className="modal-actions">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              tone="primary"
              disabled={
                busy ||
                !accountId ||
                !categoryId ||
                (!merchantId && !merchantName)
              }
            >
              Add transaction
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
export { ImportTransactions } from "./TransactionImport";
