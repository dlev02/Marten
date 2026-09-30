/**
 * Calm provenance text for values an AI connection wrote, such as
 * "Updated by ChatGPT · 2h ago". The name is the connection's display name
 * when it wrote the value, so a later rename or disconnect does not rewrite
 * history.
 */
export type AgentWriter = { name: string; at: number };

const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

/** Short elapsed time: "just now", "5m ago", "2h ago", "3d ago", then a date. */
export function elapsedLabel(at: number, now: number) {
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return dayFormat.format(new Date(at));
}

export function writtenByLabel(
  writer: AgentWriter,
  now: number,
  verb = "Updated",
) {
  return `${verb} by ${writer.name} · ${elapsedLabel(writer.at, now)}`;
}
