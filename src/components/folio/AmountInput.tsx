import type { InputHTMLAttributes } from "react";
import { hiddenAmount, useAmountsHidden } from "../../lib/amountVisibility";

/** Keep the real draft in the owner; never put it in the masked input's DOM. */
export function AmountInput({
  sensitive = true,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { sensitive?: boolean }) {
  const hidden = useAmountsHidden() && sensitive;
  if (!hidden) return <input {...props} />;
  return (
    <input
      id={props.id}
      className={props.className}
      aria-label={props["aria-label"]}
      aria-describedby={props["aria-describedby"]}
      type="text"
      value={hiddenAmount}
      disabled
      title="Amounts are hidden. Turn off Hide amounts in Preferences to edit."
    />
  );
}
