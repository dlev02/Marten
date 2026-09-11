import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";
import "./colorPicker.css";

const colors = [
  ["Ocean", "#247a94"],
  ["Blue", "#3868a8"],
  ["Indigo", "#605cac"],
  ["Plum", "#91539c"],
  ["Rose", "#b84f72"],
  ["Red", "#b74740"],
  ["Terracotta", "#b96542"],
  ["Amber", "#a87922"],
  ["Olive", "#788330"],
  ["Leaf", "#4e8753"],
  ["Forest", "#28775d"],
  ["Teal", "#277d78"],
  ["Slate", "#63768d"],
  ["Stone", "#82756b"],
  ["Brown", "#805b49"],
  ["Graphite", "#60615e"],
  ["Charcoal", "#3d464b"],
  ["Midnight", "#293e56"],
] as const;

function ink(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => parseInt(channel, 16)) ?? [0, 0, 0];
  return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 165
    ? "#171b1d"
    : "#ffffff";
}

export function ColorPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const valid = /^#[0-9a-f]{6}$/i.test(draft);
  const selected = colors.find(
    ([, color]) => color.toLowerCase() === value.toLowerCase(),
  );
  const choose = (color: string) => {
    onChange(color);
    setOpen(false);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="color-picker-trigger"
          aria-label={label}
        >
          <i style={{ background: value }} />
          <span>{selected?.[0] ?? value.toUpperCase()}</span>
          <ChevronDown size={15} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="color-picker-menu"
          align="start"
          sideOffset={7}
          collisionPadding={12}
          aria-label={label}
        >
          <div
            className="color-picker-palette"
            role="group"
            aria-label="Choose a color"
          >
            {colors.map(([name, color]) => (
              <button
                key={color}
                type="button"
                aria-label={name}
                aria-pressed={color.toLowerCase() === value.toLowerCase()}
                style={{ background: color, color: ink(color) }}
                onClick={() => choose(color)}
              >
                {color.toLowerCase() === value.toLowerCase() && (
                  <Check size={17} />
                )}
              </button>
            ))}
          </div>
          <label className="color-picker-custom">
            <span>Custom color</span>
            <div>
              <input
                aria-label="Hex color"
                value={draft}
                maxLength={7}
                spellCheck={false}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (valid) choose(draft);
                  }
                }}
                placeholder="#247A94"
              />
              <button
                type="button"
                disabled={!valid}
                onClick={() => choose(draft)}
              >
                Apply
              </button>
            </div>
          </label>
          <p>Choose a shade, or enter a six-digit hex color.</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
