const RELOAD_KEY = "folio-chunk-reload-at";

/** A lazy route chunk that no longer exists after a deploy, or never arrived. */
export function isStaleChunkError(error: unknown) {
  const message =
    error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading (CSS )?chunk/i.test(
    message,
  );
}

/**
 * Reloads once when the page is running code that no longer matches the
 * deployed build. A second failure within a minute is shown instead of
 * looping, so a genuinely broken deploy still surfaces an explanation.
 */
export function reloadForStaleChunk() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Without storage we still try once; the boundary shows the screen next time.
  }
  window.location.reload();
  return true;
}
