import { createContext, forwardRef, useContext, type ReactNode } from "react";
import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import "./select.css";

// Nested controls must stay inside their dialog's allowed scroll boundary.
// This shared context intentionally refreshes the consuming controls together.
// eslint-disable-next-line react-refresh/only-export-components
export const PickerPortalContext = createContext<HTMLElement | null>(null);

export type SelectOption = { value: string; label: string; disabled?: boolean };
export type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  icon?: ReactNode;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

/** Shared, keyboard-accessible menu for short choices. Use Picker for searchable lists. */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  function Select(
    {
      value,
      onValueChange,
      options,
      placeholder,
      disabled,
      className = "",
      id,
      name,
      icon,
      ...aria
    },
    ref,
  ) {
    const portalContainer = useContext(PickerPortalContext);
    // Radix reserves an empty value for its placeholder. Index keys let an actual
    // “All accounts” option safely represent an empty filter value.
    const selected = options.findIndex((option) => option.value === value);
    return (
      <RadixSelect.Root
        value={selected < 0 ? "" : String(selected)}
        onValueChange={(index) => onValueChange(options[Number(index)].value)}
        disabled={disabled}
        name={name}
      >
        <RadixSelect.Trigger
          ref={ref}
          id={id}
          {...aria}
          className={`folio-select ${className}`}
        >
          {icon}
          <RadixSelect.Value
            className="folio-select-label"
            placeholder={placeholder}
          />
          <RadixSelect.Icon asChild>
            <ChevronDown size={15} />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal container={portalContainer}>
          <RadixSelect.Content
            className="folio-select-menu"
            position="popper"
            sideOffset={5}
            collisionPadding={12}
            collisionBoundary={portalContainer}
          >
            <RadixSelect.ScrollUpButton className="folio-select-scroll">
              <ChevronUp size={15} />
            </RadixSelect.ScrollUpButton>
            <RadixSelect.Viewport className="folio-select-options">
              {options.map((option, index) => (
                <RadixSelect.Item
                  key={option.value}
                  value={String(index)}
                  disabled={option.disabled}
                  className="folio-select-option"
                >
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator>
                    <Check size={15} />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
            <RadixSelect.ScrollDownButton className="folio-select-scroll">
              <ChevronDown size={15} />
            </RadixSelect.ScrollDownButton>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    );
  },
);
Select.displayName = "Select";
