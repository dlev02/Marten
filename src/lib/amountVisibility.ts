import { useSyncExternalStore } from "react";
import { money, compactMoney } from "./format";

export const hiddenAmount = "••••";
const storageKey = "marten-hide-amounts";
const listeners = new Set<() => void>();
let hidden = false;
try {
  hidden = localStorage.getItem(storageKey) === "true";
} catch {
  // Still usable for this session when browser storage is unavailable.
}
export const amountsHidden = () => hidden;
function notify() {
  for (const listener of listeners) listener();
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey || event.key === null) {
      hidden = event.key === null ? false : event.newValue === "true";
      notify();
    }
  });
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function setAmountsHidden(value: boolean) {
  hidden = value;
  try {
    localStorage.setItem(storageKey, String(value));
  } catch {
    // Update immediately even if this device cannot persist the preference.
  }
  notify();
}
export function useAmountsHidden() {
  return useSyncExternalStore(subscribe, amountsHidden, () => false);
}
/** Presentation only. Calculations, saved values and exports use raw format.ts. */
export function displayMoney(...args: Parameters<typeof money>) {
  return hidden ? hiddenAmount : money(...args);
}
export function displayCompactMoney(...args: Parameters<typeof compactMoney>) {
  return hidden ? hiddenAmount : compactMoney(...args);
}
export function displayFinancialValue(value: string) {
  return hidden ? hiddenAmount : value;
}
