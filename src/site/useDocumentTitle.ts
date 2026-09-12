import { useEffect } from "react";

/** Sets the tab title for a public page and restores it on unmount. */
export function useDocumentTitle(title: string, description?: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    const previousDescription = meta?.content;
    if (meta && description) meta.content = description;
    return () => {
      document.title = previous;
      if (meta && previousDescription !== undefined)
        meta.content = previousDescription;
    };
  }, [title, description]);
}
