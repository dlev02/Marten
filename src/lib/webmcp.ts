export type SiteTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    consequentialHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (
    input: Record<string, unknown>,
    context: { signal: AbortSignal },
  ) => Promise<unknown>;
};

export type BrowserModelContext = {
  registerTool: (
    tool: SiteTool,
    options?: { signal: AbortSignal },
  ) => Promise<void> | void;
};

export function browserModelContext(): BrowserModelContext | undefined {
  const context = (
    document as Document & { modelContext?: BrowserModelContext }
  ).modelContext;
  return typeof context?.registerTool === "function" ? context : undefined;
}

export async function registerSiteTools(
  context: BrowserModelContext,
  tools: SiteTool[],
  signal: AbortSignal,
) {
  for (const tool of tools) {
    if (signal.aborted) return;
    await context.registerTool(
      {
        ...tool,
        execute: async (input, invocation) => {
          if (signal.aborted || invocation?.signal?.aborted)
            throw new Error(
              "This tool is no longer available. Reopen Marten and check AI connections.",
            );
          return await tool.execute(input, invocation);
        },
      },
      { signal },
    );
  }
}
