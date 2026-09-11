import { flushSync } from "react-dom";

export type AppFont = "folio" | "system";

let currentTransition: ViewTransition | undefined;

/** User-triggered only: commit layout once, then animate browser snapshots. */
export function transitionAppearance(
  update: () => void,
  kind: "theme" | "sidebar",
) {
  currentTransition?.skipTransition();
  if (
    !document.startViewTransition ||
    document.hidden ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }
  document.documentElement.dataset.uiTransition = kind;
  let updated = false;
  try {
    const transition = document.startViewTransition(() => {
      updated = true;
      flushSync(update);
    });
    currentTransition = transition;
    void transition.ready.catch(() => undefined);
    void transition.finished
      .catch(() => undefined)
      .finally(() => {
        if (currentTransition === transition) {
          currentTransition = undefined;
          delete document.documentElement.dataset.uiTransition;
        }
      });
  } catch {
    delete document.documentElement.dataset.uiTransition;
    if (!updated) update();
  }
}

export function readFont(): AppFont {
  try {
    return localStorage.getItem("folio-font") === "system" ? "system" : "folio";
  } catch {
    return "folio";
  }
}

export function applyFont(font: AppFont) {
  document.documentElement.dataset.font = font;
  try {
    localStorage.setItem("folio-font", font);
  } catch {
    /* The choice still applies when storage is unavailable. */
  }
}
