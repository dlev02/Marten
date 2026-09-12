import { useState, type DragEvent } from "react";
import { useMutation } from "convex/react";
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { useData } from "../../lib/data";
import {
  Button,
  Empty,
  Field,
  IconButton,
  Modal,
  Panel,
  Picker,
  Toggle,
  useTask,
} from "../../components/folio/ui";
import { moveItem } from "./ordering";
import { Select } from "../../components/folio/Select";
import { CategoryIcon } from "../../components/folio/CategoryIcon";
import categoryIcons from "../../lib/categoryIcons.json";
export function OrderControls({
  name,
  first,
  last,
  onMove,
  onDrag,
}: {
  name: string;
  first: boolean;
  last: boolean;
  onMove: (direction: number) => void;
  onDrag: (event: DragEvent) => void;
}) {
  return (
    <span className="settings-order">
      <button
        className="settings-grip"
        aria-label={`Drag to reorder ${name}`}
        draggable
        onDragStart={onDrag}
      >
        <GripVertical size={16} />
      </button>
      <span className="settings-order-buttons">
        <IconButton
          label={`Move ${name} up`}
          disabled={first}
          onClick={() => onMove(-1)}
        >
          <ArrowUp size={12} />
        </IconButton>
        <IconButton
          label={`Move ${name} down`}
          disabled={last}
          onClick={() => onMove(1)}
        >
          <ArrowDown size={12} />
        </IconButton>
      </span>
    </span>
  );
}
function dragItem(event: DragEvent, id: string) {
  event.stopPropagation();
  event.dataTransfer.setData("text/plain", id);
  event.dataTransfer.effectAllowed = "move";
}
export function Categories() {
  const data = useData(),
    task = useTask(),
    reorder = useMutation(api.settings.reorder);
  const [category, setCategory] = useState<Doc<"categories"> | "new" | null>(
      null,
    ),
    [group, setGroup] = useState<Doc<"groups"> | "new" | null>(null),
    [defaultGroup, setDefaultGroup] = useState<Id<"groups"> | undefined>();
  const reorderList = (
    ids: (Id<"categories"> | Id<"groups">)[],
    source: string,
    target: string,
  ) => void task.run(() => reorder({ ids: moveItem(ids, source, target) }));
  const addCategory = (groupId?: Id<"groups">) => {
    setDefaultGroup(groupId);
    setCategory("new");
  };
  return (
    <>
      <div className="settings-section-header">
        <div>
          <h2>Categories</h2>
          <p>Organize your transactions into groups that make sense to you.</p>
        </div>
        <Button icon={<Plus size={15} />} onClick={() => setGroup("new")}>
          Add group
        </Button>
      </div>
      <div className="settings-section-header category-suggestions">
        <p>
          Add missing everyday and travel categories, including accommodation,
          transit, pharmacy, and video games. Your existing categories stay as
          they are.
        </p>
        <Button
          disabled={task.busy}
          onClick={() =>
            void task.run(
              () => addSuggestions({}),
              "Suggested categories are up to date",
            )
          }
        >
          Add suggested categories
        </Button>
      </div>
      {(["income", "expense", "transfer"] as const).map((kind) => {
        const groups = data.groups
          .filter((g) => g.kind === kind)
          .sort((a, b) => a.order - b.order);
        return (
          <section className="settings-kind" key={kind}>
            <h3>
              {kind === "expense"
                ? "Expenses"
                : kind === "income"
                  ? "Income"
                  : "Transfers"}
              <span>
                {kind === "transfer"
                  ? "Excluded from cash flow"
                  : `${data.categories.filter((c) => groups.some((g) => g._id === c.groupId)).length} categories`}
              </span>
            </h3>
            {groups.map((g, groupIndex) => {
              const categories = data.categories
                .filter((c) => c.groupId === g._id)
                .sort((a, b) => a.order - b.order);
              return (
                <Panel key={g._id} className="settings-category-group">
                  <div
                    className="settings-group-header"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      reorderList(
                        groups.map((item) => item._id),
                        e.dataTransfer.getData("text/plain"),
                        g._id,
                      );
                    }}
                  >
                    <OrderControls
                      name={g.name}
                      first={groupIndex === 0}
                      last={groupIndex === groups.length - 1}
                      onDrag={(e) => dragItem(e, g._id)}
                      onMove={(direction) =>
                        reorderList(
                          groups.map((item) => item._id),
                          g._id,
                          groups[groupIndex + direction]._id,
                        )
                      }
                    />
                    <strong>{g.name}</strong>
                    <span className="settings-row-spacer" />
                    <IconButton
                      label={`Edit ${g.name} group`}
                      onClick={() => setGroup(g)}
                    >
                      <Pencil size={14} />
                    </IconButton>
                    <IconButton
                      label={`Add category to ${g.name}`}
                      onClick={() => addCategory(g._id)}
                    >
                      <Plus size={16} />
                    </IconButton>
                  </div>
                  {categories.map((c, index) => (
                    <div
                      key={c._id}
                      className={`settings-category-row ${c.enabled ? "" : "disabled"}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        reorderList(
                          categories.map((item) => item._id),
                          e.dataTransfer.getData("text/plain"),
                          c._id,
                        );
                      }}
                    >
                      <OrderControls
                        name={c.name}
                        first={index === 0}
                        last={index === categories.length - 1}
                        onDrag={(e) => dragItem(e, c._id)}
                        onMove={(direction) =>
                          reorderList(
                            categories.map((item) => item._id),
                            c._id,
                            categories[index + direction]._id,
                          )
                        }
                      />
                      <CategoryIcon
                        className="settings-category-emoji"
                        emoji={c.emoji}
                      />
                      <button
                        className="settings-name-button"
                        onClick={() => setCategory(c)}
                      >
                        {c.name}
                      </button>
                      {!c.enabled && (
                        <span className="settings-badge">Disabled</span>
                      )}
                      <IconButton
                        label={`Edit ${c.name} category`}
                        onClick={() => setCategory(c)}
                      >
                        <Pencil size={14} />
                      </IconButton>
                    </div>
                  ))}
                  {!categories.length && (
                    <button
                      className="settings-add-row"
                      onClick={() => addCategory(g._id)}
                    >
                      <Plus size={14} />
                      Add a category
                    </button>
                  )}
                </Panel>
              );
            })}
            {!groups.length && (
              <div className="settings-empty-group">
                No {kind === "expense" ? "expense" : kind} groups yet.
              </div>
            )}
          </section>
        );
      })}
      {!data.groups.length && (
        <Empty
          title="Create your first category group"
          description="Groups determine how transactions appear in your cash flow and reports."
        />
      )}
      {category && (
        <CategoryEditor
          key={category === "new" ? `new-${defaultGroup}` : category._id}
          category={category === "new" ? undefined : category}
          defaultGroup={defaultGroup}
          onClose={() => setCategory(null)}
        />
      )}{" "}
      {group && (
        <GroupEditor
          key={group === "new" ? "new" : group._id}
          group={group === "new" ? undefined : group}
          onClose={() => setGroup(null)}
        />
      )}
    </>
  );
}
function CategoryEditor({
  category,
  defaultGroup,
  onClose,
}: {
  category?: Doc<"categories">;
  defaultGroup?: Id<"groups">;
  onClose: () => void;
}) {
  const data = useData(),
    task = useTask(),
    save = useMutation(api.settings.saveCategory);
  const [name, setName] = useState(category?.name ?? ""),
    [emoji, setEmoji] = useState(category?.emoji ?? "•"),
    [groupId, setGroupId] = useState<string>(
      category?.groupId ?? defaultGroup ?? data.groups[0]?._id ?? "",
    ),
    [enabled, setEnabled] = useState(category?.enabled ?? true);
  return (
    <Modal
      open
      onClose={onClose}
      title={category ? "Edit category" : "Add category"}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void task.run(async () => {
            if (!groupId) throw new Error("Create a group first.");
            await save({
              ...(category ? { id: category._id } : {}),
              name,
              emoji,
              groupId: groupId as Id<"groups">,
              enabled,
              order:
                category?.groupId === groupId
                  ? category.order
                  : data.categories.filter((c) => c.groupId === groupId).length,
            });
            onClose();
          }, "Category saved");
        }}
      >
        <div className="settings-form-grid">
          <Field label="Icon">
            <CategoryIconPicker value={emoji} onChange={setEmoji} />
          </Field>
          <Field label="Name">
            <input
              aria-label="Category name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required
              autoFocus
            />
          </Field>
        </div>
        <Field label="Group">
          <Picker
            label="Category group"
            value={groupId}
            onChange={setGroupId}
            options={data.groups.map((g) => ({
              value: g._id,
              label: g.name,
              group:
                g.kind === "expense"
                  ? "Expenses"
                  : g.kind === "income"
                    ? "Income"
                    : "Transfers",
            }))}
          />
        </Field>
        <Toggle
          label="Enabled"
          description="Disabled categories remain on existing transactions but are hidden from category pickers."
          checked={enabled}
          onChange={setEnabled}
        />
        <div className="settings-dialog-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" tone="primary" disabled={task.busy || !groupId}>
            Save category
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function GroupEditor({
  group,
  onClose,
}: {
  group?: Doc<"groups">;
  onClose: () => void;
}) {
  const data = useData(),
    task = useTask(),
    save = useMutation(api.settings.saveGroup);
  const [name, setName] = useState(group?.name ?? ""),
    [kind, setKind] = useState<Doc<"groups">["kind"]>(group?.kind ?? "expense");
  return (
    <Modal open onClose={onClose} title={group ? "Edit group" : "Add group"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void task.run(async () => {
            await save({
              ...(group ? { id: group._id } : {}),
              name,
              kind,
              order: group?.order ?? data.groups.length,
            });
            onClose();
          }, "Group saved");
        }}
      >
        <Field label="Name">
          <input
            aria-label="Group name"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <Field
          label="Type"
          hint="Changing the type also changes how existing transactions in this group are counted in reports."
        >
          <Select
            aria-label="Group type"
            value={kind}
            onValueChange={(value) => setKind(value as typeof kind)}
            options={[
              { value: "expense", label: "Expenses" },
              { value: "income", label: "Income" },
              { value: "transfer", label: "Transfers" },
            ]}
          />
        </Field>
        <div className="settings-dialog-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" tone="primary" disabled={task.busy}>
            Save group
          </Button>
        </div>
      </form>
    </Modal>
  );
}
