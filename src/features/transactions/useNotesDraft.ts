import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createNotesDraft } from "./notesDraft";
import { useBlocker } from "react-router-dom";
import { resumeNotesNavigation } from "./notesNavigation";

/** Mounted inside the transaction-keyed drawer fields, so drafts never cross IDs. */
export function useNotesDraft(
  serverValue: string,
  persist: (value: string) => Promise<void>,
) {
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const [draft] = useState(() =>
    createNotesDraft(serverValue, (value) => persistRef.current(value)),
  );
  const snapshot = useSyncExternalStore(
    draft.subscribe,
    draft.getSnapshot,
    draft.getSnapshot,
  );
  const blocker = useBlocker(
    useCallback(() => {
      const state = draft.getSnapshot();
      return state.dirty || state.status === "saving";
    }, [draft]),
  );
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    let current = true;
    void resumeNotesNavigation(blocker, draft.flush, () => current);
    return () => {
      current = false;
    };
  }, [blocker, draft]);
  useEffect(() => {
    draft.receive(serverValue);
  }, [draft, serverValue]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const state = draft.getSnapshot();
      if (!state.dirty && state.status !== "saving") return;
      event.preventDefault();
      event.returnValue = "";
      void draft.flush();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      // Drawer controls and SPA routes await flush. Keep a final handoff for
      // an external auth change that unmounts the application.
      void draft.flush();
      draft.clearTimer();
    };
  }, [draft]);
  return { ...snapshot, setValue: draft.setValue, flush: draft.flush };
}
