import { afterEach, describe, expect, test, vi } from "vitest";
import { createNotesDraft } from "../src/features/transactions/notesDraft";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => vi.useRealTimers());

describe("transaction note persistence", () => {
  test("debounces typing and exposes unsaved state until the write is acknowledged", async () => {
    vi.useFakeTimers();
    const write = deferred(),
      persist = vi.fn(() => write.promise),
      draft = createNotesDraft("Original", persist);
    draft.setValue("A");
    await vi.advanceTimersByTimeAsync(400);
    draft.setValue("A complete note");
    expect(draft.getSnapshot()).toMatchObject({
      status: "unsaved",
      dirty: true,
    });
    await vi.advanceTimersByTimeAsync(599);
    expect(persist).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(persist).toHaveBeenCalledExactlyOnceWith("A complete note");
    expect(draft.getSnapshot().status).toBe("saving");
    write.resolve();
    await draft.flush();
    expect(draft.getSnapshot()).toMatchObject({
      status: "saved",
      dirty: false,
    });
  });

  test("close before the debounce flushes immediately and concurrent blur/close share one save", async () => {
    vi.useFakeTimers();
    const write = deferred(),
      persist = vi.fn(() => write.promise),
      draft = createNotesDraft("", persist);
    draft.setValue("Do not lose this note");
    const blur = draft.flush(),
      close = draft.flush();
    expect(close).toBe(blur);
    await Promise.resolve();
    expect(persist).toHaveBeenCalledExactlyOnceWith("Do not lose this note");
    write.resolve();
    expect(await close).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  test("navigation waits for the newest edit made while an earlier write is in flight", async () => {
    vi.useFakeTimers();
    const first = deferred(),
      second = deferred();
    const persist = vi
      .fn<(_: string) => Promise<void>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const draft = createNotesDraft("Old", persist);
    draft.setValue("First edit");
    const closing = draft.flush();
    await Promise.resolve();
    draft.setValue("Intermediate edit");
    draft.setValue("Final edit");
    first.resolve();
    await Promise.resolve();
    expect(persist.mock.calls.map(([value]) => value)).toEqual([
      "First edit",
      "Final edit",
    ]);
    expect(draft.getSnapshot()).toMatchObject({
      value: "Final edit",
      dirty: true,
      status: "saving",
    });
    let closed = false;
    void closing.then((ok) => {
      closed = ok;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    second.resolve();
    expect(await closing).toBe(true);
    expect(draft.getSnapshot()).toMatchObject({
      value: "Final edit",
      dirty: false,
      status: "saved",
    });
  });

  test("undoing to the original note during a save still restores the server value", async () => {
    vi.useFakeTimers();
    const first = deferred(),
      persist = vi
        .fn<(_: string) => Promise<void>>()
        .mockReturnValueOnce(first.promise)
        .mockResolvedValue(undefined);
    const draft = createNotesDraft("Original", persist);
    draft.setValue("Changed");
    const closing = draft.flush();
    await Promise.resolve();
    draft.setValue("Original");
    first.resolve();
    expect(await closing).toBe(true);
    expect(persist.mock.calls.map(([value]) => value)).toEqual([
      "Changed",
      "Original",
    ]);
  });

  test("a rejected write blocks navigation, keeps the draft and succeeds on explicit retry", async () => {
    vi.useFakeTimers();
    const persist = vi
      .fn<(_: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("Connection unavailable"))
      .mockResolvedValue(undefined);
    const draft = createNotesDraft("Saved note", persist);
    draft.setValue("Keep my failed edit");
    expect(await draft.flush()).toBe(false);
    expect(draft.getSnapshot()).toEqual({
      value: "Keep my failed edit",
      dirty: true,
      status: "error",
      error: "Connection unavailable",
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(await draft.flush()).toBe(true);
    expect(draft.getSnapshot()).toMatchObject({
      value: "Keep my failed edit",
      status: "saved",
      dirty: false,
      error: null,
    });
  });

  test("metadata refreshes do not overwrite a draft or repeatedly resave acknowledged notes", async () => {
    vi.useFakeTimers();
    const persist = vi
      .fn<(_: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    const draft = createNotesDraft("Original", persist);
    draft.setValue("Local draft");
    draft.receive("Original");
    draft.receive("Another server note");
    expect(draft.getSnapshot().value).toBe("Local draft");
    await draft.flush();
    draft.receive("Local draft");
    draft.receive("Local draft");
    await vi.advanceTimersByTimeAsync(2000);
    expect(persist).toHaveBeenCalledExactlyOnceWith("Local draft");
    draft.receive("Later external edit");
    expect(draft.getSnapshot()).toMatchObject({
      value: "Later external edit",
      dirty: false,
      status: "saved",
    });
  });
});
