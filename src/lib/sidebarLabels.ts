import { useSyncExternalStore } from "react";

const key = "marten-sidebar-labels";
const eventName = "marten-sidebar-labels-change";
function read() {
  try {
    return localStorage.getItem(key) !== "false";
  } catch {
    return true;
  }
}
function subscribe(callback: () => void) {
  window.addEventListener(eventName, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(eventName, callback);
    window.removeEventListener("storage", callback);
  };
}
export function useSidebarLabels() {
  return useSyncExternalStore(subscribe, read, () => true);
}
export function setSidebarLabels(enabled: boolean) {
  try {
    localStorage.setItem(key, String(enabled));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(eventName));
}
