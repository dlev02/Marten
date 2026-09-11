import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Combine,
  ImagePlus,
  Pencil,
  Plus,
  Store,
  Tag,
  Trash2,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { useData, type Metadata } from "../../lib/data";
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
  useTask,
} from "../../components/folio/ui";
import { OrderControls } from "./Categories";
import { moveItem } from "./ordering";
import { ColorPicker } from "../../components/folio/ColorPicker";
type Merchant = Metadata["merchants"][number];
export function Merchants() {
  const data = useData(),
    [search, setSearch] = useState(""),
    [editing, setEditing] = useState<Merchant | "new" | null>(null),
    [merging, setMerging] = useState<Merchant | null>(null);
  const merchants = data.merchants
    .filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <div className="settings-section-header">
        <div>
          <h2>Merchants</h2>
          <p>Keep names consistent and bring duplicate merchants together.</p>
        </div>
        <Button icon={<Plus size={15} />} onClick={() => setEditing("new")}>
          Add merchant
        </Button>
      </div>
      <div className="settings-search">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search merchants…"
        />
        <span className="muted">{merchants.length} merchants</span>
      </div>
      <Panel className="settings-list">
        {merchants.length ? (
          merchants.map((m) => (
            <div className="settings-merchant-row" key={m._id}>
              <Avatar name={m.name} color={m.color} logo={m.resolvedLogoUrl} />
              <button
                className="settings-name-button"
                onClick={() => setEditing(m)}
              >
                {m.name}
              </button>
              <Link
                className="settings-count-link"
                to={`/transactions?merchant=${m._id}`}
              >
                {m.transactionCount.toLocaleString()}{" "}
                {m.transactionCount === 1 ? "transaction" : "transactions"}{" "}
                <ArrowUpRight size={12} />
              </Link>
              <IconButton
                label={`Edit ${m.name}`}
                onClick={() => setEditing(m)}
              >
                <Pencil size={15} />
              </IconButton>
              <IconButton
                label={`Merge ${m.name}`}
                onClick={() => setMerging(m)}
              >
                <Combine size={16} />
              </IconButton>
            </div>
          ))
        ) : (
          <Empty
            icon={<Store size={26} />}
            title={
              search ? "No merchants found" : "Your merchants will appear here"
            }
            description={
              search
                ? "Try another name."
                : "Merchants are created when your transactions arrive."
            }
          />
        )}
      </Panel>
      {editing && (
        <MerchantEditor
          key={editing === "new" ? "new" : editing._id}
          merchant={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}{" "}
      {merging && (
        <MergeMerchant source={merging} onClose={() => setMerging(null)} />
      )}
    </>
  );
}
function MerchantEditor({
  merchant,
  onClose,
}: {
  merchant?: Merchant;
  onClose: () => void;
}) {
  const task = useTask(),
    save = useMutation(api.settings.saveMerchant),
    upload = useAction(api.settings.uploadMerchantLogo);
  const [name, setName] = useState(merchant?.name ?? ""),
    [color, setColor] = useState(merchant?.color ?? "#64748b"),
    [file, setFile] = useState<File | null>(null),
    [savedId, setSavedId] = useState(merchant?._id);
  return (
    <Modal
      open
      onClose={() => !task.busy && onClose()}
      title={merchant ? "Edit merchant" : "Add merchant"}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void task.run(async () => {
            const id = await save({
              ...(savedId ? { id: savedId } : {}),
              name,
              color,
            });
            setSavedId(id);
            if (file)
              await upload({
                merchantId: id,
                contentType: file.type,
                bytes: await file.arrayBuffer(),
              });
            onClose();
          }, "Merchant saved");
        }}
      >
        <div className="settings-logo-editor">
          <Avatar
            name={name || "Merchant"}
            color={color}
            logo={merchant?.resolvedLogoUrl}
            size="large"
          />
          <label className="settings-file-button">
            <ImagePlus size={16} />
            {file ? file.name : "Choose logo"}
            <input
              aria-label="Merchant logo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <small className="muted">JPEG, PNG, or WebP, up to 2 MB.</small>
        <Field label="Name">
          <input
            aria-label="Merchant name"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Fallback color">
          <ColorPicker
            label="Merchant color"
            value={
              color.startsWith("#") && color.length === 7 ? color : "#64748b"
            }
            onChange={setColor}
          />
        </Field>
        <div className="settings-dialog-actions">
          <Button type="button" onClick={onClose} disabled={task.busy}>
            Cancel
          </Button>
          <Button tone="primary" type="submit" disabled={task.busy}>
            Save merchant
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function MergeMerchant({
  source,
  onClose,
}: {
  source: Merchant;
  onClose: () => void;
}) {
  const data = useData(),
    task = useTask(),
    merge = useMutation(api.settings.mergeMerchants),
    [targetId, setTargetId] = useState(""),
    [progress, setProgress] = useState(0);
  return (
    <Modal
      open
      onClose={() => !task.busy && onClose()}
      title="Merge merchants"
      description={`Move every transaction, recurring item, and rule action from ${source.name} to another merchant, then remove ${source.name}.`}
    >
      <Field label="Keep this merchant">
        <Picker
          label="Destination merchant"
          value={targetId}
          onChange={setTargetId}
          options={data.merchants
            .filter((m) => m._id !== source._id)
            .map((m) => ({
              value: m._id,
              label: m.name,
              icon: (
                <Avatar
                  name={m.name}
                  logo={m.resolvedLogoUrl}
                  color={m.color}
                  size="small"
                />
              ),
            }))}
        />
      </Field>
      <div className="settings-merge-summary">
        <strong>{source.name}</strong>
        <span>will merge into</span>
        <strong>
          {data.merchants.find((m) => m._id === targetId)?.name ??
            "Choose a merchant"}
        </strong>
      </div>
      <p className="settings-helper">
        Notes, tags, receipts, and amounts stay with their transactions. This
        merge cannot be undone automatically.
      </p>
      {task.busy && (
        <Loading
          text={`Merging transactions… ${progress.toLocaleString()} updated`}
        />
      )}
      <div className="settings-dialog-actions">
        <Button onClick={onClose} disabled={task.busy}>
          Cancel
        </Button>
        <Button
          tone="primary"
          disabled={!targetId || task.busy}
          onClick={() =>
            void task.run(async () => {
              let cursor: string | null = null,
                done = false,
                updated = 0;
              while (!done) {
                const page = await merge({
                  sourceId: source._id,
                  targetId: targetId as Id<"merchants">,
                  cursor,
                });
                cursor = page.cursor;
                done = page.done;
                updated += page.updated;
                setProgress(updated);
              }
              onClose();
            }, "Merchants merged")
          }
        >
          Merge merchants
        </Button>
      </div>
    </Modal>
  );
}
export function TagSettings() {
  const data = useData(),
    task = useTask(),
    reorder = useMutation(api.settings.reorder),
    remove = useMutation(api.settings.deleteTag),
    [editing, setEditing] = useState<Doc<"tags"> | "new" | null>(null),
    [deleting, setDeleting] = useState<Doc<"tags"> | null>(null);
  const tags = [...data.tags].sort((a, b) => a.order - b.order),
    ids = tags.map((t) => t._id);
  const move = (source: string, target: string) =>
    void task.run(() => reorder({ ids: moveItem(ids, source, target) }));
  return (
    <>
      <div className="settings-section-header">
        <div>
          <h2>Tags</h2>
          <p>Add your own labels across categories and accounts.</p>
        </div>
        <Button icon={<Plus size={15} />} onClick={() => setEditing("new")}>
          Add tag
        </Button>
      </div>
      <Panel className="settings-list">
        {tags.length ? (
          tags.map((tag, index) => (
            <div
              key={tag._id}
              className="settings-tag-row"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                move(e.dataTransfer.getData("text/plain"), tag._id);
              }}
            >
              <OrderControls
                name={tag.name}
                first={index === 0}
                last={index === tags.length - 1}
                onDrag={(e) => {
                  e.dataTransfer.setData("text/plain", tag._id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onMove={(direction) =>
                  move(tag._id, tags[index + direction]._id)
                }
              />
              <span
                className="settings-tag-symbol"
                style={{ color: tag.color }}
              >
                <Tag size={17} />
              </span>
              <button
                className="settings-name-button"
                onClick={() => setEditing(tag)}
              >
                {tag.name}
              </button>
              <IconButton
                label={`Edit ${tag.name}`}
                onClick={() => setEditing(tag)}
              >
                <Pencil size={15} />
              </IconButton>
              <IconButton
                label={`Delete ${tag.name}`}
                onClick={() => setDeleting(tag)}
              >
                <Trash2 size={15} />
              </IconButton>
            </div>
          ))
        ) : (
          <Empty
            icon={<Tag size={26} />}
            title="Label the things that matter"
            description="Use tags for a trip, reimbursements, or any detail you want to find later."
            action={
              <Button onClick={() => setEditing("new")}>
                Add your first tag
              </Button>
            }
          />
        )}
      </Panel>
      {editing && (
        <TagEditor
          key={editing === "new" ? "new" : editing._id}
          tag={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <Modal
        open={!!deleting}
        onClose={() => !task.busy && setDeleting(null)}
        title="Delete tag?"
        description={`Remove “${deleting?.name ?? "this tag"}” from all transactions and rules. Your transactions stay in Marten.`}
      >
        {task.busy && <Loading text="Removing tag from transactions…" />}
        <div className="settings-dialog-actions">
          <Button disabled={task.busy} onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button
            tone="danger"
            disabled={task.busy}
            onClick={() => {
              if (deleting)
                void task.run(async () => {
                  let cursor: string | null = null,
                    done = false;
                  while (!done) {
                    const page = await remove({ id: deleting._id, cursor });
                    done = page.done;
                    cursor = page.cursor;
                  }
                  setDeleting(null);
                }, "Tag deleted");
            }}
          >
            Delete tag
          </Button>
        </div>
      </Modal>
    </>
  );
}
function TagEditor({
  tag,
  onClose,
}: {
  tag?: Doc<"tags">;
  onClose: () => void;
}) {
  const data = useData(),
    task = useTask(),
    save = useMutation(api.settings.saveTag),
    [name, setName] = useState(tag?.name ?? ""),
    [color, setColor] = useState(tag?.color ?? "#00a3bd");
  return (
    <Modal open onClose={onClose} title={tag ? "Edit tag" : "Add tag"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void task.run(async () => {
            await save({
              ...(tag ? { id: tag._id } : {}),
              name,
              color,
              order: tag?.order ?? data.tags.length,
            });
            onClose();
          }, "Tag saved");
        }}
      >
        <Field label="Name">
          <input
            aria-label="Tag name"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Color">
          <ColorPicker
            label="Tag color"
            value={
              color.startsWith("#") && color.length === 7 ? color : "#00a3bd"
            }
            onChange={setColor}
          />
        </Field>
        <div className="settings-dialog-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" tone="primary" disabled={task.busy}>
            Save tag
          </Button>
        </div>
      </form>
    </Modal>
  );
}
