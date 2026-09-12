import {
  useAmountsHidden,
  displayMoney as money,
} from "../../lib/amountVisibility";
import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "../../lib/useReducedMotion";

const DURATION_MS = 420;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Tweens between money values so a total that changes after a checkmark or a
 * toggle glides rather than snapping. Reduced motion shows the new value at once.
 */
export function AnimatedMoney({
  cents,
  decimals = true,
  className,
}: {
  cents: number;
  decimals?: boolean;
  className?: string;
}) {
  useAmountsHidden();
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(cents);
  const previous = useRef(cents);
  useEffect(() => {
    const from = previous.current;
    previous.current = cents;
    if (reduced || from === cents) {
      setShown(cents);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / DURATION_MS);
      setShown(Math.round(from + (cents - from) * easeOut(progress)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [cents, reduced]);
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {money(shown, decimals)}
    </span>
  );
}
