import { describe, expect, it, vi } from "vitest";
import { registerSiteTools, type SiteTool } from "./webmcp";
describe("WebMCP registration lifetime", () => {
  it("binds registrations to the page lifetime and rejects a stale invocation", async () => {
    const registrations: SiteTool[] = [];
    const invoke = vi.fn().mockResolvedValue({ balanceCents: 500 });
    const controller = new AbortController();
    const registerTool = vi.fn(
      (tool: SiteTool, options?: { signal: AbortSignal }) => {
        expect(options?.signal).toBe(controller.signal);
        registrations.push(tool);
      },
    );
    await registerSiteTools(
      { registerTool },
      [
        {
          name: "read_accounts",
          description: "Read owned account values",
          inputSchema: { type: "object" },
          annotations: { readOnlyHint: true },
          execute: invoke,
        },
      ],
      controller.signal,
    );
    expect(
      await registrations[0].execute(
        {},
        { signal: new AbortController().signal },
      ),
    ).toEqual({ balanceCents: 500 });
    controller.abort();
    await expect(
      registrations[0].execute({}, { signal: new AbortController().signal }),
    ).rejects.toThrow("no longer available");
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it("does not publish tools after access is disabled during loading", async () => {
    const controller = new AbortController();
    const registerTool = vi.fn();
    controller.abort();
    await registerSiteTools(
      { registerTool },
      [
        {
          name: "read",
          description: "Read",
          inputSchema: {},
          annotations: { readOnlyHint: true },
          execute: vi.fn(),
        },
      ],
      controller.signal,
    );
    expect(registerTool).not.toHaveBeenCalled();
  });
});
