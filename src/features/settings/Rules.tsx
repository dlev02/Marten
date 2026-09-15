import { AmountInput } from "../../components/folio/AmountInput";
import {
  useAmountsHidden,
  displayMoney as money,
} from "../../lib/amountVisibility";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useConvex, useMutation } from "../../lib/convex";
import type { FunctionReturnType } from "convex/server";
import {
  Check,
  Pencil,
  Play,
  Plus,
  SearchCheck,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  useData,
  accountOptions,
  categoryOptions,
  merchantOptions,
  type Metadata,
} from "../../lib/data";
import { dateLabel, parseMoney } from "../../lib/format";
import {
  Avatar,
  Button,
  Empty,
  Field,
  IconButton,
  Loading,
  Modal,
  Panel,
  Picker,
  SearchBox,
  Tabs,
  useTask,
} from "../../components/folio/ui";
import { OrderControls } from "./Categories";
import {
  SortableList,
  SortableItem,
} from "../../components/folio/SortableList";
import { moveItem } from "./ordering";
import { Select } from "../../components/folio/Select";
type RuleFields = Omit<Doc<"rules">, "_id" | "_creationTime" | "userId">;
type Condition = RuleFields["conditions"][number];
type SplitDraft = { categoryId: string; amount: string; note: string };
const fieldsFor = (rule: Doc<"rules">): RuleFields => ({
  name: rule.name,
  enabled: rule.enabled,
  order: rule.order,
  match: rule.match,
  conditions: rule.conditions,
  actions: rule.actions,
});
function conditionLabel(condition: Condition, data: Metadata) {
  const value =
    condition.field === "account"
      ? (data.accounts.find((a) => a._id === condition.value)?.name ??
        "account")
      : condition.field === "category"
        ? (data.categories.find((c) => c._id === condition.value)?.name ??
          "category")
        : condition.field === "amount"
          ? money(Number(condition.value) * 100)
          : `“${condition.value}”`;
  return `${condition.field === "statement" ? "Statement" : condition.field[0].toUpperCase() + condition.field.slice(1)} ${condition.operator === "equals" ? "is" : condition.operator === "greater" ? "is more than" : condition.operator === "less" ? "is less than" : "contains"} ${value}`;
}
function actionLabel(actions: RuleFields["actions"], data: Metadata) {
  const labels = [];
  if (actions.merchantId)
    labels.push(
      `Rename to ${data.merchants.find((m) => m._id === actions.merchantId)?.name ?? "merchant"}`,
    );
  if (actions.categoryId)
    labels.push(
      `Categorize as ${data.categories.find((c) => c._id === actions.categoryId)?.name ?? "category"}`,
    );
  if (actions.tagIds)
    labels.push(
      actions.tagIds.length
        ? `Set ${actions.tagIds.length} tag${actions.tagIds.length === 1 ? "" : "s"}`
        : "Clear tags",
    );
  if (actions.hidden !== undefined)
    labels.push(actions.hidden ? "Hide transaction" : "Show transaction");
  if (actions.reviewed !== undefined)
    labels.push(actions.reviewed ? "Mark reviewed" : "Mark unreviewed");
  if (actions.splits)
    labels.push(
      actions.splits.length
        ? `Split into ${actions.splits.length} categories`
        : "Remove splits",
    );
  return labels.join(" · ");
}
export function Rules() {
  useAmountsHidden();
  const [params] = useSearchParams();
  const requestedSearch = params.get("search") ?? "";
  const data = useData(),
    task = useTask(),
    save = useMutation(api.settings.saveRule),
    remove = useMutation(api.settings.deleteRule),
    reorder = useMutation(api.settings.reorder);
  const [search, setSearch] = useState(requestedSearch),
    [editing, setEditing] = useState<Doc<"rules"> | "new" | null>(null),
    [deleting, setDeleting] = useState<Doc<"rules"> | null>(null);
  useEffect(() => setSearch(requestedSearch), [requestedSearch]);
  const rules = [...data.rules].sort((a, b) => a.order - b.order),
    filtered = rules.filter((r) =>
      `${r.name} ${r.conditions.map((c) => conditionLabel(c, data)).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  const move = (source: string, target: string) =>
    void task.run(() =>
      reorder({
        ids: moveItem(
          rules.map((r) => r._id),
          source,
          target,
        ),
      }),
    );
  return (
    <>
      <div className="settings-section-header">
        <div>
          <h2>Rules</h2>
          <p>Automatically organize new transactions the way you like.</p>
        </div>
        <Button icon={<Plus size={15} />} onClick={() => setEditing("new")}>
          Create rule
        </Button>
      </div>
      <div className="settings-rule-explainer">
        <Workflow size={18} />
        <p>
          Rules run from top to bottom. Later rules can update earlier results.
          Drag a rule to change its order.
        </p>
      </div>
      {rules.length > 0 && (
        <div className="settings-search">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search rules…"
          />
          <span className="muted">
            {rules.filter((r) => r.enabled).length} active
          </span>
        </div>
      )}
      <Panel className="settings-list">
        {filtered.length ? (
          <SortableList
            ids={filtered.map((rule) => rule._id)}
            disabled={task.busy}
            onReorder={(ordered) => {
              // Preserve hidden rules in their slots when reordering search results.
              let index = 0;
              const visible = new Set(ordered);
              return task.run(() =>
                reorder({
                  ids: rules.map((rule) =>
                    visible.has(rule._id) ? ordered[index++] : rule._id,
                  ),
                }),
              );
            }}
          >
            {(ordered) =>
              ordered.map((id) => {
                const rule = rules.find((item) => item._id === id)!;
                const index = rules.findIndex((r) => r._id === rule._id);
                return (
                  <SortableItem
                    id={rule._id}
                    name={rule.name}
                    className={`settings-rule-row ${rule.enabled ? "" : "disabled"}`}
                    key={rule._id}
                  >
                    <OrderControls
                      name={rule.name}
                      first={index === 0}
                      last={index === rules.length - 1}
                      onMove={(direction) =>
                        move(rule._id, rules[index + direction]._id)
                      }
                    />
                    <button
                      className="settings-rule-body"
                      onClick={() => setEditing(rule)}
                    >
                      <strong>{rule.name}</strong>
                      <span>
                        {rule.conditions
                          .map((c) => conditionLabel(c, data))
                          .join(rule.match === "all" ? " and " : " or ")}
                      </span>
                      <small>{actionLabel(rule.actions, data)}</small>
                    </button>
                    <label className="settings-rule-enable">
                      <input
                        aria-label={`Enable ${rule.name}`}
                        type="checkbox"
                        role="switch"
                        checked={rule.enabled}
                        disabled={task.busy}
                        onChange={(e) =>
                          void task.run(() =>
                            save({
                              id: rule._id,
                              ...fieldsFor(rule),
                              enabled: e.target.checked,
                            }),
                          )
                        }
                      />
                      <span>{rule.enabled ? "On" : "Off"}</span>
                    </label>
                    <IconButton
                      type="button"
                      label={`Edit ${rule.name}`}
                      onClick={() => setEditing(rule)}
                    >
                      <Pencil size={15} />
                    </IconButton>
                    <IconButton
                      type="button"
                      label={`Delete ${rule.name}`}
                      onClick={() => setDeleting(rule)}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </SortableItem>
                );
              })
            }
          </SortableList>
        ) : (
          <Empty
            icon={<Workflow size={26} />}
            title={search ? "No rules match" : "Put routine edits on autopilot"}
            description={
              search
                ? "Try a different search."
                : "Match a merchant, statement, amount, account, or category and choose what happens next."
            }
            action={
              !search && (
                <Button onClick={() => setEditing("new")}>
                  Create your first rule
                </Button>
              )
            }
          />
        )}
      </Panel>
      {editing && (
        <RuleEditor
          key={editing === "new" ? "new" : editing._id}
          rule={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete rule?"
        description={`Delete “${deleting?.name ?? "this rule"}”? Edits already applied to transactions will stay.`}
      >
        <div className="settings-dialog-actions">
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button
            tone="danger"
            disabled={task.busy}
            onClick={() => {
              if (deleting)
                void task.run(async () => {
                  await remove({ id: deleting._id });
                  setDeleting(null);
                }, "Rule deleted");
            }}
          >
            Delete rule
          </Button>
        </div>
      </Modal>
    </>
  );
}
type ActionKey =
  | "merchant"
  | "category"
  | "tags"
  | "hidden"
  | "reviewed"
  | "splits";
/** One change a rule can make: a switch in the row head, its controls beneath. */
function ActionRow({
  label,
  hint,
  on,
  onToggle,
  children,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onToggle: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className={`rule-action${on ? " on" : ""}`}>
      <label className="toggle-row">
        <div>
          <strong>{label}</strong>
          {hint && <p>{hint}</p>}
        </div>
        <input
          type="checkbox"
          role="switch"
          aria-label={label}
          checked={on}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="switch" />
      </label>
      <div className="rule-action-body" aria-hidden={!on}>
        <div>
          <fieldset className="rule-action-inner" disabled={!on}>
            {children}
          </fieldset>
        </div>
      </div>
    </div>
  );
}
function RuleEditor({
  rule,
  onClose,
}: {
  rule?: Doc<"rules">;
  onClose: () => void;
}) {
  useAmountsHidden();
  const data = useData(),
    client = useConvex(),
    task = useTask(),
    save = useMutation(api.settings.saveRule),
    saveMerchant = useMutation(api.settings.saveMerchant),
    apply = useMutation(api.settings.applyRule);
  const [name, setName] = useState(rule?.name ?? ""),
    [match, setMatch] = useState<RuleFields["match"]>(rule?.match ?? "all"),
    [enabled, setEnabled] = useState(rule?.enabled ?? true),
    [conditions, setConditions] = useState<Condition[]>(
      rule?.conditions ?? [
        { field: "merchant", operator: "contains", value: "" },
      ],
    ),
    [actions, setActions] = useState<RuleFields["actions"]>(
      rule?.actions ?? {},
    ),
    // A merchant name typed into the picker is created when the rule is saved,
    // so cancelling never leaves an empty merchant behind.
    [newMerchant, setNewMerchant] = useState(""),
    [on, setOn] = useState<Record<ActionKey, boolean>>({
      merchant: !!rule?.actions.merchantId,
      category: !!rule?.actions.categoryId,
      tags: rule?.actions.tagIds !== undefined,
      hidden: rule?.actions.hidden !== undefined,
      reviewed: rule?.actions.reviewed !== undefined,
      splits: rule?.actions.splits !== undefined,
    }),
    [splits, setSplits] = useState<SplitDraft[]>(
      rule?.actions.splits?.map((s) => ({
        categoryId: s.categoryId,
        amount: (s.amountCents / 100).toFixed(2),
        note: s.note ?? "",
      })) ?? [],
    ),
    [applyExisting, setApplyExisting] = useState(false),
    [savedId, setSavedId] = useState(rule?._id);
  const [preview, setPreview] = useState<Doc<"transactions">[] | null>(null),
    [previewRunning, setPreviewRunning] = useState(false),
    [applied, setApplied] = useState<number | null>(null);
  const signature = JSON.stringify({ match, conditions, on, splits });
  useEffect(() => {
    setPreview(null);
  }, [signature]);
  const updateCondition = (index: number, patch: Partial<Condition>) =>
    setConditions((list) =>
      list.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  const updateActions = (patch: Partial<RuleFields["actions"]>) =>
    setActions((previous) => ({ ...previous, ...patch }));
  const toggleAction = (key: ActionKey, value: boolean) => {
    setOn((previous) => ({ ...previous, [key]: value }));
    if (!value) return;
    // Switching a change on gives it a sensible starting value right away.
    if (key === "hidden" && actions.hidden === undefined)
      updateActions({ hidden: true });
    if (key === "reviewed" && actions.reviewed === undefined)
      updateActions({ reviewed: true });
    if (key === "tags" && actions.tagIds === undefined)
      updateActions({ tagIds: [] });
  };
  const merchantValue = newMerchant ? "new" : (actions.merchantId ?? "");
  function build(requireActions: boolean): RuleFields {
    if (conditions.some((c) => !c.value.trim()))
      throw new Error("Complete each matching condition.");
    if (
      conditions.some(
        (c) => c.field === "amount" && !Number.isFinite(Number(c.value)),
      )
    )
      throw new Error("Enter a valid amount to match.");
    const clean: RuleFields["actions"] = {};
    if (on.merchant) {
      if (!actions.merchantId && !newMerchant.trim())
        throw new Error("Choose the merchant name to apply.");
      if (actions.merchantId) clean.merchantId = actions.merchantId;
    }
    if (on.category) {
      if (!actions.categoryId) throw new Error("Choose the category to apply.");
      clean.categoryId = actions.categoryId;
    }
    if (on.tags) clean.tagIds = actions.tagIds ?? [];
    if (on.hidden) clean.hidden = actions.hidden ?? true;
    if (on.reviewed) clean.reviewed = actions.reviewed ?? true;
    if (on.splits) {
      if (splits.length === 1)
        throw new Error(
          "Use at least two split allocations, or remove all allocations to clear splits.",
        );
      clean.splits = splits.map((s) => {
        if (!s.categoryId) throw new Error("Choose a category for each split.");
        return {
          categoryId: s.categoryId as Id<"categories">,
          amountCents: parseMoney(s.amount),
          ...(s.note.trim() ? { note: s.note.trim() } : {}),
        };
      });
    }
    if (
      requireActions &&
      !Object.keys(clean).length &&
      !(on.merchant && newMerchant.trim())
    )
      throw new Error("Switch on at least one change for this rule.");
    return {
      name: name.trim() || "Rule preview",
      match,
      conditions: conditions.map((c) => ({ ...c, value: c.value.trim() })),
      actions: clean,
      enabled,
      order: rule?.order ?? data.rules.length,
    };
  }
  async function previewMatches() {
    const fields = build(false);
    setPreviewRunning(true);
    setPreview(null);
    try {
      let cursor: string | null = null,
        done = false;
      const rows: Doc<"transactions">[] = [];
      while (!done) {
        const page: FunctionReturnType<typeof api.settings.previewRule> =
          await client.query(api.settings.previewRule, {
            ...fields,
            paginationOpts: { numItems: 100, cursor },
          });
        rows.push(...page.page);
        cursor = page.continueCursor;
        done = page.isDone;
      }
      setPreview(rows);
    } finally {
      setPreviewRunning(false);
    }
  }
  /** Reuses a merchant that already exists under the typed name instead of failing. */
  async function resolveNewMerchant(): Promise<Id<"merchants">> {
    const typed = newMerchant.trim();
    const key = typed.toLowerCase().replace(/\s+/g, " ");
    const existing = data.merchants.find((m) => m.normalizedName === key);
    if (existing) return existing._id;
    return await saveMerchant({ name: typed, color: "#64748b" });
  }
  async function saveRule() {
    const fields = build(true);
    if (on.merchant && !fields.actions.merchantId)
      fields.actions.merchantId = await resolveNewMerchant();
    const id = await save({ ...(savedId ? { id: savedId } : {}), ...fields });
    setSavedId(id);
    if (applyExisting && enabled) {
      let cursor: string | null = null,
        done = false,
        total = 0;
      setApplied(0);
      while (!done) {
        const page = await apply({
          id,
          paginationOpts: { cursor, numItems: 100 },
        });
        total += page.updated;
        setApplied(total);
        cursor = page.continueCursor;
        done = page.isDone;
      }
    }
    onClose();
  }
  const chosenTags = actions.tagIds ?? [];
  return (
    <Modal
      open
      onClose={() => !task.busy && onClose()}
      title={rule ? "Edit rule" : "Create rule"}
      wide
      description="Describe the transactions on the left and switch on the changes to make on the right."
    >
      <form
        className="rule-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void task.run(
            saveRule,
            applyExisting && enabled ? "Rule saved and applied" : "Rule saved",
          );
        }}
      >
        <fieldset disabled={task.busy} className="rule-editor-fieldset">
          <div className="rule-editor-name">
            <Field label="Rule name">
              <input
                aria-label="Rule name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
                placeholder="For example, organize grocery spending"
                autoFocus
              />
            </Field>
            {rule && (
              <label className="toggle-row rule-editor-enabled">
                <div>
                  <strong>{enabled ? "Rule is on" : "Rule is off"}</strong>
                </div>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="Rule enabled"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <span className="switch" />
              </label>
            )}
          </div>
          <div className="rule-editor-columns">
            <section>
              <h3>
                <span>1</span>If a transaction matches
              </h3>
              <label className="rule-match">
                <Select
                  aria-label="Rule match mode"
                  value={match}
                  onValueChange={(value) => setMatch(value as typeof match)}
                  options={[
                    { value: "all", label: "All" },
                    { value: "any", label: "Any" },
                  ]}
                />
                of these conditions
              </label>
              <div className="rule-conditions">
                {conditions.map((condition, index) => (
                  <div className="rule-condition" key={index}>
                    <Select
                      aria-label={`Condition ${index + 1} field`}
                      value={condition.field}
                      onValueChange={(value) => {
                        const field = value as Condition["field"];
                        updateCondition(index, {
                          field,
                          value: "",
                          operator:
                            field === "merchant" || field === "statement"
                              ? "contains"
                              : "equals",
                        });
                      }}
                      options={[
                        { value: "merchant", label: "Merchant name" },
                        { value: "statement", label: "Original statement" },
                        { value: "amount", label: "Amount" },
                        { value: "account", label: "Account" },
                        { value: "category", label: "Category" },
                      ]}
                    />
                    <Select
                      aria-label={`Condition ${index + 1} comparison`}
                      value={condition.operator}
                      onValueChange={(value) =>
                        updateCondition(index, {
                          operator: value as Condition["operator"],
                        })
                      }
                      options={[
                        ...(["merchant", "statement"].includes(condition.field)
                          ? [{ value: "contains", label: "contains" }]
                          : []),
                        { value: "equals", label: "is exactly" },
                        ...(condition.field === "amount"
                          ? [
                              { value: "greater", label: "is more than" },
                              { value: "less", label: "is less than" },
                            ]
                          : []),
                      ]}
                    />
                    <IconButton
                      type="button"
                      label={`Remove condition ${index + 1}`}
                      disabled={conditions.length === 1}
                      onClick={() =>
                        setConditions((list) =>
                          list.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <X size={14} />
                    </IconButton>
                    {condition.field === "account" ? (
                      <Picker
                        className="rule-condition-value"
                        label={`Condition ${index + 1} account`}
                        value={condition.value}
                        onChange={(value) => updateCondition(index, { value })}
                        options={accountOptions(data)}
                      />
                    ) : condition.field === "category" ? (
                      <Picker
                        className="rule-condition-value"
                        label={`Condition ${index + 1} category`}
                        value={condition.value}
                        onChange={(value) => updateCondition(index, { value })}
                        options={categoryOptions(data)}
                      />
                    ) : (
                      <AmountInput
                        className="rule-condition-value"
                        sensitive={condition.field === "amount"}
                        aria-label={`Condition ${index + 1} value`}
                        value={condition.value}
                        onChange={(e) =>
                          updateCondition(index, { value: e.target.value })
                        }
                        placeholder={
                          condition.field === "amount"
                            ? "0.00"
                            : condition.field === "statement"
                              ? "Text from the bank’s description"
                              : "Text in the merchant name"
                        }
                        inputMode={
                          condition.field === "amount" ? "decimal" : "text"
                        }
                        maxLength={500}
                      />
                    )}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                icon={<Plus size={14} />}
                disabled={conditions.length >= 20}
                onClick={() =>
                  setConditions((list) => [
                    ...list,
                    { field: "merchant", operator: "contains", value: "" },
                  ])
                }
              >
                Add condition
              </Button>
              <p className="settings-helper">
                Amounts are positive for spending and negative for deposits and
                refunds.
              </p>
            </section>
            <section>
              <h3>
                <span>2</span>Then make these changes
              </h3>
              <div className="rule-actions">
                <ActionRow
                  label="Rename merchant"
                  hint="Pick an existing merchant or type a new name."
                  on={on.merchant}
                  onToggle={(value) => toggleAction("merchant", value)}
                >
                  <Picker
                    label="Merchant to apply"
                    placeholder="Choose or create a merchant"
                    value={merchantValue}
                    onChange={(value) => {
                      if (value === "new") return;
                      setNewMerchant("");
                      updateActions({
                        merchantId: value
                          ? (value as Id<"merchants">)
                          : undefined,
                      });
                    }}
                    onCreate={(search) => {
                      if (!search) return;
                      setNewMerchant(search);
                      updateActions({ merchantId: undefined });
                    }}
                    createLabel="Create merchant"
                    options={[
                      ...(newMerchant
                        ? [{ value: "new", label: `${newMerchant} · new` }]
                        : []),
                      ...merchantOptions(data),
                    ]}
                  />
                </ActionRow>
                <ActionRow
                  label="Update category"
                  on={on.category}
                  onToggle={(value) => toggleAction("category", value)}
                >
                  <Picker
                    label="Category to apply"
                    placeholder="Choose a category"
                    value={actions.categoryId ?? ""}
                    onChange={(value) =>
                      updateActions({
                        categoryId: value
                          ? (value as Id<"categories">)
                          : undefined,
                      })
                    }
                    options={categoryOptions(data)}
                  />
                </ActionRow>
                <ActionRow
                  label="Set tags"
                  hint="Replaces any tags already on the transaction."
                  on={on.tags}
                  onToggle={(value) => toggleAction("tags", value)}
                >
                  {data.tags.length ? (
                    <div className="rule-tags">
                      {data.tags.map((tag) => (
                        <label
                          key={tag._id}
                          className={
                            chosenTags.includes(tag._id) ? "chosen" : ""
                          }
                        >
                          <input
                            type="checkbox"
                            checked={chosenTags.includes(tag._id)}
                            onChange={(e) =>
                              updateActions({
                                tagIds: e.target.checked
                                  ? [...chosenTags, tag._id]
                                  : chosenTags.filter((id) => id !== tag._id),
                              })
                            }
                          />
                          <span
                            className="settings-tag-symbol"
                            style={{ color: tag.color }}
                          >
                            ●
                          </span>
                          {tag.name}
                        </label>
                      ))}
                      <small className="muted">
                        No tags selected clears existing tags.
                      </small>
                    </div>
                  ) : (
                    <p className="settings-helper">
                      Create tags under Settings → Tags first. Saving with none
                      selected clears existing tags.
                    </p>
                  )}
                </ActionRow>
                <ActionRow
                  label="Visibility"
                  hint="Hidden transactions stay out of reports and cash flow."
                  on={on.hidden}
                  onToggle={(value) => toggleAction("hidden", value)}
                >
                  <Tabs
                    pill
                    value={String(actions.hidden ?? true)}
                    onChange={(value) =>
                      updateActions({ hidden: value === "true" })
                    }
                    items={[
                      { value: "true", label: "Hide" },
                      { value: "false", label: "Show" },
                    ]}
                  />
                </ActionRow>
                <ActionRow
                  label="Review status"
                  on={on.reviewed}
                  onToggle={(value) => toggleAction("reviewed", value)}
                >
                  <Tabs
                    pill
                    value={String(actions.reviewed ?? true)}
                    onChange={(value) =>
                      updateActions({ reviewed: value === "true" })
                    }
                    items={[
                      { value: "true", label: "Mark reviewed" },
                      { value: "false", label: "Needs review" },
                    ]}
                  />
                </ActionRow>
                <ActionRow
                  label="Split allocations"
                  hint="Applies only when the amounts add up to the transaction total."
                  on={on.splits}
                  onToggle={(value) => toggleAction("splits", value)}
                >
                  <div className="rule-splits">
                    {splits.map((split, index) => (
                      <div className="rule-split" key={index}>
                        <Picker
                          label={`Split ${index + 1} category`}
                          value={split.categoryId}
                          onChange={(categoryId) =>
                            setSplits((list) =>
                              list.map((s, i) =>
                                i === index ? { ...s, categoryId } : s,
                              ),
                            )
                          }
                          options={categoryOptions(data)}
                        />
                        <AmountInput
                          aria-label={`Split ${index + 1} amount`}
                          value={split.amount}
                          inputMode="decimal"
                          placeholder="0.00"
                          onChange={(e) =>
                            setSplits((list) =>
                              list.map((s, i) =>
                                i === index
                                  ? { ...s, amount: e.target.value }
                                  : s,
                              ),
                            )
                          }
                        />
                        <IconButton
                          type="button"
                          label={`Remove split ${index + 1}`}
                          onClick={() =>
                            setSplits((list) =>
                              list.filter((_, i) => i !== index),
                            )
                          }
                        >
                          <X size={14} />
                        </IconButton>
                        <input
                          aria-label={`Split ${index + 1} note`}
                          placeholder="Optional note"
                          value={split.note}
                          onChange={(e) =>
                            setSplits((list) =>
                              list.map((s, i) =>
                                i === index
                                  ? { ...s, note: e.target.value }
                                  : s,
                              ),
                            )
                          }
                        />
                      </div>
                    ))}
                    <Button
                      type="button"
                      icon={<Plus size={14} />}
                      disabled={splits.length >= 50}
                      onClick={() =>
                        setSplits((list) => [
                          ...list,
                          { categoryId: "", amount: "", note: "" },
                        ])
                      }
                    >
                      Add allocation
                    </Button>
                    {!splits.length && (
                      <p className="settings-helper">
                        No allocations removes existing splits.
                      </p>
                    )}
                  </div>
                </ActionRow>
              </div>
            </section>
          </div>
          <div className="settings-preview-heading">
            <div>
              <h3>Preview matching transactions</h3>
              <p>Preview checks existing transactions without changing them.</p>
            </div>
            <Button
              type="button"
              icon={<SearchCheck size={16} />}
              onClick={() => void task.run(previewMatches)}
            >
              Preview matches
            </Button>
          </div>
        </fieldset>
        {previewRunning && (
          <Loading text="Checking all transactions for matches…" />
        )}
        {preview && (
          <div className="settings-rule-preview">
            <div className="settings-preview-count">
              <Check size={15} />
              {preview.length.toLocaleString()} matching transactions
              {preview.length > 30 && <span> · First 30 shown</span>}
            </div>
            {preview.slice(0, 30).map((tx) => {
              const merchant = data.merchants.find(
                (m) => m._id === tx.merchantId,
              );
              return (
                <div className="settings-preview-row" key={tx._id}>
                  <Avatar
                    name={merchant?.name ?? tx.originalName}
                    color={merchant?.color}
                    logo={merchant?.resolvedLogoUrl}
                    size="small"
                  />
                  <span>
                    <strong>{merchant?.name ?? tx.originalName}</strong>
                    <small>
                      {dateLabel(tx.date)} ·{" "}
                      {
                        data.categories.find((c) => c._id === tx.categoryId)
                          ?.name
                      }
                      {tx.pending ? " · Pending" : ""}
                      {tx.hidden ? " · Hidden" : ""}
                    </small>
                  </span>
                  <strong>{money(tx.amountCents)}</strong>
                </div>
              );
            })}
            {!preview.length && (
              <p className="settings-helper">
                No transactions match these conditions and compatible split
                totals.
              </p>
            )}
          </div>
        )}
        <label className="settings-apply-existing">
          <input
            type="checkbox"
            checked={applyExisting}
            onChange={(e) => setApplyExisting(e.target.checked)}
            disabled={task.busy || !enabled}
          />
          <span>
            Also apply to existing matching transactions
            <small>
              The selected changes replace existing values, including previous
              manual edits.
            </small>
          </span>
        </label>
        {applied !== null && task.busy && (
          <Loading
            text={`Applying rule… ${applied.toLocaleString()} transactions updated`}
          />
        )}
        <div className="settings-dialog-actions">
          <Button type="button" onClick={onClose} disabled={task.busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            tone="primary"
            disabled={task.busy}
            icon={applyExisting && enabled ? <Play size={15} /> : undefined}
          >
            {applyExisting && enabled ? "Save & apply rule" : "Save rule"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
