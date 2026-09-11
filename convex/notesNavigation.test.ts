import { createMemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createNotesDraft } from "../src/features/transactions/notesDraft";
import { resumeNotesNavigation } from "../src/features/transactions/notesNavigation";

const routers: ReturnType<typeof createMemoryRouter>[] = [];
afterEach(() => {
  routers.splice(0).forEach((router) => router.dispose());
});
function fixture(persist: (value: string) => Promise<void>) {
  const draft = createNotesDraft("Saved note", persist);
  const router = createMemoryRouter([{ path: "*", element: null }], {
    initialEntries: ["/accounts", "/transactions?transaction=sample"],
    initialIndex: 1,
  });
  routers.push(router);
  router.getBlocker("notes", () => {
    const state = draft.getSnapshot();
    return state.dirty || state.status === "saving";
  });
  const blocked = () => {
    const transition = router.state.blockers.get("notes");
    if (transition?.state !== "blocked")
      throw new Error("Expected a blocked navigation");
    return transition;
  };
  return { draft, router, blocked };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("route navigation with a transaction draft", () => {
  test("browser Back keeps the drawer route until the latest note is acknowledged", async () => {
    const write = deferred(),
      persist = vi.fn(() => write.promise);
    const { draft, router, blocked } = fixture(persist);
    draft.setValue("Typed immediately before Back");
    await router.navigate(-1);
    expect(router.state.location.pathname).toBe("/transactions");
    const resuming = resumeNotesNavigation(blocked(), draft.flush);
    await Promise.resolve();
    expect(persist).toHaveBeenCalledExactlyOnceWith(
      "Typed immediately before Back",
    );
    expect(router.state.location.pathname).toBe("/transactions");
    write.resolve();
    await resuming;
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe("/accounts"),
    );
    expect(draft.getSnapshot()).toMatchObject({
      status: "saved",
      dirty: false,
    });
  });

  test("a failed save cancels route navigation without discarding the editable draft", async () => {
    const persist = vi
      .fn<(_: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("Save failed"))
      .mockResolvedValue(undefined);
    const { draft, router, blocked } = fixture(persist);
    draft.setValue("Keep this note after an error");
    await router.navigate("/reports");
    await resumeNotesNavigation(blocked(), draft.flush);
    expect(router.state.location.pathname).toBe("/transactions");
    expect(router.state.blockers.get("notes")?.state).toBe("unblocked");
    expect(draft.getSnapshot()).toMatchObject({
      value: "Keep this note after an error",
      dirty: true,
      status: "error",
    });
    await router.navigate("/reports");
    await resumeNotesNavigation(blocked(), draft.flush);
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe("/reports"),
    );
    expect(persist).toHaveBeenCalledTimes(2);
  });

  test("a newer route request replaces the blocked destination without duplicating the save", async () => {
    const write = deferred(),
      persist = vi.fn(() => write.promise);
    const { draft, router, blocked } = fixture(persist);
    draft.setValue("One final save");
    await router.navigate("/reports");
    let firstIsCurrent = true;
    const first = resumeNotesNavigation(
      blocked(),
      draft.flush,
      () => firstIsCurrent,
    );
    await Promise.resolve();
    await router.navigate("/settings/preferences");
    firstIsCurrent = false;
    const latest = resumeNotesNavigation(blocked(), draft.flush);
    write.resolve();
    await Promise.all([first, latest]);
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe("/settings/preferences"),
    );
    expect(persist).toHaveBeenCalledExactlyOnceWith("One final save");
  });
});
