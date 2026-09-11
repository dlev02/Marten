import { message } from "../../lib/format";

export type NotesSnapshot = {
  value: string;
  dirty: boolean;
  status: "saved" | "unsaved" | "saving" | "error";
  error: string | null;
};

/** A single transaction's draft. Writes are serialized and flush saves the latest edit. */
export function createNotesDraft(
  initialValue: string,
  persist: (value: string) => Promise<void>,
  delay = 600,
) {
  let value = initialValue;
  let savedValue = initialValue;
  let serverValue = initialValue;
  let error: string | null = null;
  let pending: Promise<boolean> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  let snapshot: NotesSnapshot = {
    value,
    dirty: false,
    status: "saved",
    error: null,
  };
  function publish() {
    snapshot = {
      value,
      dirty: value !== savedValue,
      status: error
        ? "error"
        : pending
          ? "saving"
          : value !== savedValue
            ? "unsaved"
            : "saved",
      error,
    };
    listeners.forEach((listener) => listener());
  }
  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  function flush(): Promise<boolean> {
    clearTimer();
    if (pending) return pending;
    if (value === savedValue) return Promise.resolve(true);
    error = null;
    pending = Promise.resolve().then(async () => {
      try {
        while (value !== savedValue) {
          const submitted = value;
          await persist(submitted);
          savedValue = submitted;
        }
        return true;
      } catch (cause) {
        error = message(cause);
        return false;
      } finally {
        pending = null;
        publish();
      }
    });
    publish();
    return pending;
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(this: void, listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setValue(this: void, next: string) {
      if (next === value) return;
      value = next;
      error = null;
      clearTimer();
      publish();
      if (value !== savedValue)
        timer = setTimeout(() => {
          void flush();
        }, delay);
    },
    receive(next: string) {
      // Other field changes can re-render the transaction with an older note snapshot.
      if (next === serverValue) return;
      serverValue = next;
      if (pending || value !== savedValue) return;
      value = next;
      savedValue = next;
      error = null;
      publish();
    },
    flush,
    clearTimer,
  };
}
