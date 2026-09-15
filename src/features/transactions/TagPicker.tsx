import { useState } from "react";
import { useMutation } from "../../lib/convex";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useData } from "../../lib/data";
import {
  Button,
  Field,
  Modal,
  Picker,
  useTask,
} from "../../components/folio/ui";
import { ColorPicker } from "../../components/folio/ColorPicker";

export function TagPicker({
  selected,
  onSelect,
  disabled = false,
}: {
  selected: Id<"tags">[];
  onSelect: (id: Id<"tags">) => void | Promise<unknown>;
  disabled?: boolean;
}) {
  const data = useData();
  const save = useMutation(api.settings.saveTag);
  const task = useTask();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#247a94");
  return (
    <>
      <Picker
        label="Add tag"
        value=""
        placeholder="Add tag"
        disabled={disabled}
        options={data.tags
          .filter((tag) => !selected.includes(tag._id))
          .map((tag) => ({
            value: tag._id,
            label: tag.name,
            icon: (
              <span className="color-dot" style={{ background: tag.color }} />
            ),
          }))}
        onChange={(id) =>
          void task.run(async () => {
            await onSelect(id as Id<"tags">);
          })
        }
        createLabel="Create tag"
        onCreate={(search) => {
          setName(search);
          setOpen(true);
        }}
      />
      <Modal
        open={open}
        onClose={() => {
          if (!task.busy) setOpen(false);
        }}
        title="Create tag"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void task.run(async () => {
              const existing = data.tags.find(
                (tag) =>
                  tag.name.trim().toLocaleLowerCase() ===
                  name.trim().toLocaleLowerCase(),
              );
              const id =
                existing?._id ??
                (await save({
                  name: name.trim(),
                  color,
                  order: data.tags.length,
                }));
              if (!selected.includes(id)) await onSelect(id);
              setOpen(false);
            }, "Tag added");
          }}
        >
          <div className="form-stack">
            <label>
              Name
              <input
                aria-label="Tag name"
                autoFocus
                required
                maxLength={200}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <Field label="Color">
              <ColorPicker
                label="Tag color"
                value={color}
                onChange={setColor}
              />
            </Field>
          </div>
          <div className="modal-actions">
            <Button disabled={task.busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              tone="primary"
              disabled={task.busy || !name.trim()}
            >
              Create tag
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
