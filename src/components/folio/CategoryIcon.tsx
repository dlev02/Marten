import icons from "../../lib/categoryIcons.json";
import "./category-icon.css";

const byEmoji = new Map(
  icons.map((icon) => [icon.emoji.replace(/\uFE0F/g, ""), icon]),
);

/** Stored emoji remain portable; the illustrated presentation is a device preference. */
export function CategoryIcon({
  emoji,
  className = "",
}: {
  emoji?: string;
  className?: string;
}) {
  if (!emoji) return null;
  const icon = byEmoji.get(emoji.replace(/\uFE0F/g, ""));
  return (
    <span
      className={`category-icon ${icon ? "has-illustration" : ""} ${className}`}
      aria-hidden="true"
    >
      {icon && (
        <img
          src={`/category-icons/${icon.file}`}
          alt=""
          width="24"
          height="24"
        />
      )}
      <span className="category-native-emoji">{emoji}</span>
    </span>
  );
}
