import { useEffect, useRef, useState } from "react";
import "../settings.css";
import { useAction, useMutation } from "convex/react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Combine,
  ImagePlus,
  Globe,
  Search,
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
import {
  SortableList,
  SortableItem,
} from "../../components/folio/SortableList";
import { moveItem } from "./ordering";
import { ColorPicker } from "../../components/folio/ColorPicker";
import { searchBrandLogos } from "../../lib/brandLogos";
import { ConvexError } from "convex/values";
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
export function MerchantEditor({
  merchant,
  onClose,
}: {
  merchant?: Merchant;
  onClose: () => void;
}) {
  const task = useTask(),
    save = useMutation(api.settings.saveMerchant),
    upload = useAction(api.settings.uploadMerchantLogo),
    findWebsiteLogo = useAction(api.merchantLogos.findWebsiteLogo),
    selectLogo = useMutation(api.merchantLogos.selectLogo);
  const [name, setName] = useState(merchant?.name ?? ""),
    [color, setColor] = useState(merchant?.color ?? "#64748b"),
    [file, setFile] = useState<File | null>(null),
    [savedId, setSavedId] = useState(merchant?._id),
    [logoMode, setLogoMode] = useState<"catalog" | "website" | null>(null),
    [logoSearch, setLogoSearch] = useState(merchant?.name ?? ""),
    [website, setWebsite] = useState(""),
    [finding, setFinding] = useState(false),
    [logoError, setLogoError] = useState(""),
    [chosenLogo, setChosenLogo] = useState<{
      url: string;
      storageId?: Id<"_storage">;
    } | null>(null),
    [filePreview, setFilePreview] = useState<string>(),
    [dragging, setDragging] = useState(false);
  // Nested dragenter/dragleave pairs fire for every child; count them so the
  // drop zone only clears when the pointer really leaves the section.
  const dragDepth = useRef(0);
  const logoBusy = finding || task.busy;
  useEffect(() => {
    if (!file) {
      setFilePreview(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  /** One validation path for the file input, drag-and-drop, and paste. */
  function acceptFile(next: File | undefined) {
    if (!next) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(next.type) ||
      next.size > 2 * 1024 * 1024
    ) {
      setLogoError("Choose a JPEG, PNG, or WebP image up to 2 MB.");
      return;
    }
    setFile(next);
    setChosenLogo(null);
    setLogoError("");
  }
  const hasFiles = (transfer: DataTransfer | null) =>
    !!transfer && Array.from(transfer.types).includes("Files");
  const dragHandlers = {
    onDragEnter: (event: React.DragEvent) => {
      if (!hasFiles(event.dataTransfer) || logoBusy) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (event: React.DragEvent) => {
      if (!hasFiles(event.dataTransfer) || logoBusy) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!hasFiles(event.dataTransfer)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (event: React.DragEvent) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (!logoBusy) acceptFile(event.dataTransfer.files[0]);
    },
  };
  const logos = searchBrandLogos(logoSearch);
  async function findWebsite() {
    setFinding(true);
    setLogoError("");
    try {
      const logo = await findWebsiteLogo({ hostname: website });
      setChosenLogo(logo);
      setFile(null);
    } catch (error) {
      setLogoError(
        error instanceof ConvexError && typeof error.data === "string"
          ? error.data
          : "The website logo couldn’t be loaded. Please try again or choose a catalog logo.",
      );
    } finally {
      setFinding(false);
    }
  }
  return (
    <Modal
      open
      onClose={() => !task.busy && !finding && onClose()}
      title={merchant ? "Edit merchant" : "Add merchant"}
    >
      <form
        onPaste={(event) => {
          // Cmd+V with an image on the clipboard uploads it; text pastes are untouched.
          const pasted = Array.from(event.clipboardData.files).find((item) =>
            item.type.startsWith("image/"),
          );
          if (!pasted || logoBusy) return;
          event.preventDefault();
          acceptFile(pasted);
        }}
        onSubmit={(e) => {
          e.preventDefault();
          void task.run(async () => {
            const id = await save({
              ...(savedId ? { id: savedId } : {}),
              name,
              color,
            });
            setSavedId(id);
            if (chosenLogo)
              await selectLogo({
                merchantId: id,
                ...(chosenLogo.storageId
                  ? { storageId: chosenLogo.storageId }
                  : { logoUrl: chosenLogo.url }),
              });
            else if (file)
              await upload({
                merchantId: id,
                contentType: file.type,
                bytes: await file.arrayBuffer(),
              });
            onClose();
          }, "Merchant saved");
        }}
      >
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
        <section
          className={`merchant-logo-section ${dragging ? "dragging" : ""}`}
          aria-label="Merchant logo"
          {...dragHandlers}
        >
          <span className="merchant-logo-label">Logo</span>
          <div className="settings-logo-editor">
            {dragging && (
              <div className="merchant-logo-dropzone" aria-hidden="true">
                <ImagePlus size={18} />
                Drop image to upload
              </div>
            )}
            <Avatar
              name={name || "Merchant"}
              color={color}
              logo={filePreview ?? chosenLogo?.url ?? merchant?.resolvedLogoUrl}
              size="large"
            />
            <div className="merchant-logo-options">
              <Button
                type="button"
                disabled={finding || task.busy}
                aria-expanded={logoMode === "catalog"}
                icon={<Search size={15} />}
                onClick={() => {
                  setLogoMode(logoMode === "catalog" ? null : "catalog");
                  setLogoError("");
                }}
              >
                Find a logo
              </Button>
              <Button
                type="button"
                disabled={finding || task.busy}
                aria-expanded={logoMode === "website"}
                icon={<Globe size={15} />}
                onClick={() => {
                  setLogoMode(logoMode === "website" ? null : "website");
                  setLogoError("");
                }}
              >
                From a website
              </Button>
              <label
                className={`settings-file-button ${logoBusy ? "is-disabled" : ""}`}
              >
                <ImagePlus size={15} />
                Upload image
                <input
                  aria-label="Merchant logo file"
                  type="file"
                  disabled={logoBusy}
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    acceptFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
          {(chosenLogo || file) && (
            <p className="merchant-logo-status" role="status">
              {file ? file.name : "Logo selected"} · Preview above. Save
              merchant to apply.
            </p>
          )}
          {logoMode === "catalog" && (
            <div className="merchant-logo-finder">
              <label
                className="merchant-logo-label"
                htmlFor="merchant-logo-search"
              >
                Search the logo catalog
              </label>
              <input
                id="merchant-logo-search"
                value={logoSearch}
                onChange={(event) => setLogoSearch(event.target.value)}
                placeholder="Brand name, e.g. Costco"
              />
              <div
                className="merchant-logo-results"
                role="group"
                aria-label="Matching logos"
              >
                {logos.slice(0, 60).map((logo) => (
                  <button
                    type="button"
                    key={logo.url}
                    aria-label={`Use ${logo.name} logo`}
                    aria-pressed={chosenLogo?.url === logo.url}
                    onClick={() => {
                      setChosenLogo({ url: logo.url });
                      setFile(null);
                      setLogoError("");
                    }}
                  >
                    <img src={logo.url} alt="" loading="lazy" />
                    <span>{logo.name}</span>
                  </button>
                ))}
              </div>
              <p className="settings-helper" role="status">
                {logos.length
                  ? `${logos.length > 60 ? "Showing 60 of " : ""}${logos.length} logos. Search stays on this device.`
                  : "No logos found. Try another name, use a website, or upload an image."}
              </p>
            </div>
          )}
          {logoMode === "website" && (
            <div className="merchant-logo-finder">
              <label
                className="merchant-logo-label"
                htmlFor="merchant-logo-website"
              >
                Website domain
              </label>
              <div className="merchant-website-row">
                <input
                  id="merchant-logo-website"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  placeholder="costco.com"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={finding}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (website.trim() && !finding) void findWebsite();
                    }
                  }}
                />
                <Button
                  type="button"
                  disabled={!website.trim() || finding || task.busy}
                  onClick={() => void findWebsite()}
                >
                  {finding ? "Finding…" : "Find logo"}
                </Button>
              </div>
              <p className="settings-helper">
                Marten checks this website directly. No third-party logo service
                is used.
              </p>
            </div>
          )}
          {logoError && (
            <p className="merchant-logo-error" role="alert">
              {logoError}
            </p>
          )}
          <small className="muted">
            Upload, drop, or paste a JPEG, PNG, or WebP image up to 2 MB.
          </small>
        </section>
        <div className="settings-dialog-actions">
          <Button
            type="button"
            onClick={onClose}
            disabled={task.busy || finding}
          >
            Cancel
          </Button>
          <Button tone="primary" type="submit" disabled={task.busy || finding}>
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
          <SortableList
            ids={ids}
            disabled={task.busy}
            onReorder={(ids) => task.run(() => reorder({ ids }))}
          >
            {(order) =>
              order.map((id, index) => {
                const tag = tags.find((item) => item._id === id)!;
                return (
                  <SortableItem
                    id={tag._id}
                    name={tag.name}
                    key={tag._id}
                    className="settings-tag-row"
                  >
                    <OrderControls
                      name={tag.name}
                      first={index === 0}
                      last={index === tags.length - 1}
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
                  </SortableItem>
                );
              })
            }
          </SortableList>
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
