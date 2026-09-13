import { isStaleChunkError } from "./staleChunk";

export function serviceErrorKind(
  error: unknown,
): "update" | "connection" | "server" | null {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (
    isStaleChunkError(error) ||
    /Could not find (public )?function|ArgumentValidationError|ReturnsValidationError|No matching export|Client version.*(old|unsupported)/i.test(
      raw,
    )
  )
    return "update";
  if (
    /Failed to fetch|NetworkError|Load failed|ECONNREFUSED|offline|WebSocket.*(closed|connect|error)|connection.*(lost|closed|failed)|server.*(unavailable|temporarily)/i.test(
      raw,
    )
  )
    return "connection";
  if (
    /\[CONVEX|Server Error|Request ID|Uncaught Error|InternalServerError|SystemTimeoutError/i.test(
      raw,
    )
  )
    return "server";
  return null;
}
export const serviceMessages = {
  update:
    "This page may need an update. Copy any unsaved details, then reload and check your transactions before trying again.",
  connection:
    "Connection interrupted. Keep this page open. If you were saving, wait for confirmation before trying again.",
  server:
    "Marten couldn’t complete this request. Keep your details and try again in a moment. If it keeps happening, reload after copying any unsaved work.",
};
