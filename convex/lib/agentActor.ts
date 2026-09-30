import type { Id } from "../_generated/dataModel";

/**
 * The AI connection making a write: its grant (absent for the in-browser
 * assistant) and its display name at the time, e.g. "ChatGPT" or the name of
 * an access key. Carried on the mutation context so shared operations can
 * record who made a change without new arguments.
 */
export type AgentActor = {
  grantId?: Id<"agentGrants">;
  name: string;
};
export const BROWSER_ASSISTANT = "Browser assistant";

/** The stored provenance for a value an assistant wrote just now. */
export function writerStamp(actor: AgentActor) {
  return {
    ...(actor.grantId ? { grantId: actor.grantId } : {}),
    name: actor.name,
    at: Date.now(),
  };
}
