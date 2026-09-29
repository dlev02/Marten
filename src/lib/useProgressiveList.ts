import { useEffect, useRef, useState } from "react";

/**
 * Renders a long list in batches: the first batch mounts immediately and the
 * next one is added as a sentinel after the last row nears the viewport. The
 * count resets whenever `items` changes identity (a new search or sort).
 */
export function useProgressiveList<T>(items: T[], batch = 100) {
  const [limit, setLimit] = useState(batch);
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = limit < items.length;
  useEffect(() => setLimit(batch), [items, batch]);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting))
          setLimit((current) => current + batch);
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, batch, limit]);
  return { visible: items.slice(0, limit), hasMore, sentinel };
}
