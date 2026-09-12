import catalog from "./categoryIcons.json";

export const categoryIcons = catalog;
export const categoryIconGroups = [
  ...new Set(catalog.map((icon) => icon.group)),
];
export const normalizeCategoryEmoji = (emoji: string) =>
  emoji.replace(/\uFE0F/g, "");
const byEmoji = new Map(
  catalog.flatMap((icon) =>
    [icon.emoji, ...icon.aliases].map(
      (emoji) => [normalizeCategoryEmoji(emoji), icon] as const,
    ),
  ),
);

/** Presentation aliases preserve saved and exported emoji without migrating user data. */
export function getCategoryIcon(emoji: string) {
  return byEmoji.get(normalizeCategoryEmoji(emoji));
}

export function searchCategoryIcons(search: string, group = "") {
  const words = search.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return catalog.filter((icon) => {
    if (group && icon.group !== group) return false;
    const text =
      `${icon.name} ${icon.group} ${icon.keywords} ${icon.emoji} ${icon.aliases.join(" ")}`.toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}
