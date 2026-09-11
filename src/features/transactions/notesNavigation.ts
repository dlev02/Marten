/** Finish a blocked route transition only after the current transaction draft is saved. */
export async function resumeNotesNavigation(
  navigation: { proceed: () => void; reset: () => void },
  flush: () => Promise<boolean>,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  const saved = await flush();
  // A second Back/Forward or link click may replace the blocked destination.
  if (!isCurrent()) return;
  if (saved) navigation.proceed();
  else navigation.reset();
}
