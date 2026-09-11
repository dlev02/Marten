import { useEffect, useState, type ReactNode } from "react";
import { useAction, useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import {
  browserModelContext,
  registerSiteTools,
  type SiteTool,
} from "../../lib/webmcp";
import { searchDestinations } from "../../lib/searchCatalog";
import { readCalendarDate } from "../../components/folio/dateInput";
import { message } from "../../lib/format";
import {
  RegistrationContext,
  type SiteToolRegistration,
} from "../../lib/siteToolStatus";

export function WebMCPProvider({ children }: { children: ReactNode }) {
  const preferences = useQuery(api.agentAccess.browserStatus, {});
  const execute = useAction(api.agentAccess.execute);
  const navigate = useNavigate();
  const [registration, setRegistration] = useState<SiteToolRegistration>(
    () => ({
      supported: Boolean(browserModelContext()),
      count: 0,
      error: null,
    }),
  );
  const enabled = Boolean(preferences?.enabled);
  const allowEdits = Boolean(preferences?.allowEdits);

  useEffect(() => {
    const context = browserModelContext();
    const controller = new AbortController();
    setRegistration({ supported: Boolean(context), count: 0, error: null });
    if (!context || !enabled) return () => controller.abort();
    async function register() {
      // Zod/schema generation is loaded only after the owner enables site tools.
      const { agentTools } = await import("../../../convex/lib/agentTools");
      if (controller.signal.aborted) return;
      const tools: SiteTool[] = agentTools
        .filter((tool) => tool.readOnly || allowEdits)
        .map((tool) => ({
          name: `marten_${tool.name}`,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: {
            readOnlyHint: tool.readOnly,
            consequentialHint: !tool.readOnly,
            untrustedContentHint: true,
          },
          execute: async (input) => {
            try {
              return await execute({ name: tool.name, arguments: input });
            } catch (error) {
              return { error: message(error) };
            }
          },
        }));
      tools.push(
        {
          name: "marten_open_page",
          title: "Open a Marten page",
          description:
            "Navigate this live Marten tab to an existing page or setting. Changes only the displayed view; does not edit finance data.",
          inputSchema: {
            type: "object",
            properties: {
              destination: {
                type: "string",
                enum: searchDestinations.map((item) => item.id),
              },
            },
            required: ["destination"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, consequentialHint: false },
          execute: async (input) => {
            if (Object.keys(input).some((key) => key !== "destination"))
              throw new Error("Choose a listed destination.");
            const destination = searchDestinations.find(
              (item) => item.id === input.destination,
            );
            if (!destination) throw new Error("Choose a listed destination.");
            await navigate(destination.path);
            return { opened: destination.title, path: destination.path };
          },
        },
        {
          name: "marten_filter_transactions",
          title: "Show filtered transactions",
          description:
            "Open transactions in this tab with an optional date range, search, account or category filter. Omitted filters are cleared. Does not edit financial records.",
          inputSchema: {
            type: "object",
            properties: {
              search: { type: "string", maxLength: 200 },
              from: { type: "string", format: "date" },
              to: { type: "string", format: "date" },
              account: { type: "string", maxLength: 128 },
              category: { type: "string", maxLength: 128 },
            },
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, consequentialHint: false },
          execute: async (input) => {
            const params = new URLSearchParams();
            for (const [key, value] of Object.entries(input)) {
              if (
                !["search", "from", "to", "account", "category"].includes(
                  key,
                ) ||
                typeof value !== "string" ||
                value.length > (key === "search" ? 200 : 128)
              )
                throw new Error("Use the supported transaction filters.");
              if ((key === "from" || key === "to") && !readCalendarDate(value))
                throw new Error(
                  "Use real calendar dates in YYYY-MM-DD format.",
                );
              if (value) params.set(key, value);
            }
            if (
              params.get("from") &&
              params.get("to") &&
              params.get("from")! > params.get("to")!
            )
              throw new Error(
                "The end date must be on or after the start date.",
              );
            const path = `/transactions${params.size ? `?${params.toString()}` : ""}`;
            await navigate(path);
            return {
              opened: "Transactions",
              filters: Object.fromEntries(params),
              path,
            };
          },
        },
      );
      await registerSiteTools(context!, tools, controller.signal);
      if (!controller.signal.aborted)
        setRegistration({ supported: true, count: tools.length, error: null });
    }
    void register().catch(() => {
      if (!controller.signal.aborted) {
        controller.abort();
        setRegistration({
          supported: true,
          count: 0,
          error:
            "The browser could not register Marten’s tools. Reload this tab or try a browser with current WebMCP support.",
        });
      }
    });
    return () => controller.abort();
  }, [allowEdits, enabled, execute, navigate]);

  return (
    <RegistrationContext.Provider value={registration}>
      {children}
    </RegistrationContext.Provider>
  );
}
