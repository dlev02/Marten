export const moveItem = <T extends string>(
  ids: T[],
  source: string,
  target: string,
): T[] => {
  const from = ids.indexOf(source as T),
    to = ids.indexOf(target as T);
  if (from < 0 || to < 0) return ids;
  const next = [...ids];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
};
