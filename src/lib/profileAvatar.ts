import type { Doc } from "../../convex/_generated/dataModel";

type Preset = NonNullable<Doc<"profiles">["avatarPreset"]>;
const illustration = (background: string, shapes: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${background}"/>${shapes}</svg>`)}`;

export const profileAvatars: { id: Preset; name: string; url: string }[] = [
  {
    id: "sage",
    name: "Sage",
    url: illustration(
      "#dce8da",
      '<path d="M50 86V32" stroke="#46644f" stroke-width="5"/><ellipse cx="36" cy="49" rx="12" ry="22" fill="#86a38a" transform="rotate(-38 36 49)"/><ellipse cx="65" cy="39" rx="12" ry="22" fill="#526e57" transform="rotate(38 65 39)"/>',
    ),
  },
  {
    id: "ocean",
    name: "Ocean",
    url: illustration(
      "#dcebef",
      '<circle cx="72" cy="27" r="12" fill="#f9f3db"/><path d="M-10 58Q15 30 42 58T110 58V110H-10Z" fill="#80b5c3"/><path d="M-10 80Q20 50 48 78T110 78V110H-10Z" fill="#417c92"/>',
    ),
  },
  {
    id: "clay",
    name: "Clay",
    url: illustration(
      "#eee0d4",
      '<path d="M23 84V45a27 27 0 0 1 54 0v39Z" fill="#c08b73"/><path d="M37 84V46a13 13 0 0 1 26 0v38Z" fill="#f5eadf"/>',
    ),
  },
  {
    id: "dusk",
    name: "Dusk",
    url: illustration(
      "#dfddea",
      '<circle cx="53" cy="43" r="24" fill="#79718f"/><circle cx="66" cy="33" r="21" fill="#dfddea"/><path d="M0 85L28 61L56 82L79 67L100 83V100H0Z" fill="#aaa3bc"/>',
    ),
  },
  {
    id: "sunrise",
    name: "Sunrise",
    url: illustration(
      "#f1e6ce",
      '<circle cx="50" cy="44" r="23" fill="#d7ad61"/><path d="M0 72Q25 48 54 71T100 67V100H0Z" fill="#d2b391"/><path d="M0 90Q24 65 54 85T100 82V100H0Z" fill="#ad8d73"/>',
    ),
  },
  {
    id: "slate",
    name: "Slate",
    url: illustration(
      "#e0e6e6",
      '<path d="M-5 91L40 22L86 91Z" fill="#7c9495"/><path d="M30 91L73 42L110 91Z" fill="#4c6d71"/><path d="M28 41L40 22L53 42L40 37Z" fill="#f0f3ef"/>',
    ),
  },
];

export function profileAvatarUrl(
  profile:
    | {
        avatarUrl?: string | null;
        avatarPreset?: Preset;
      }
    | null
    | undefined,
) {
  return (
    profile?.avatarUrl ??
    profileAvatars.find((avatar) => avatar.id === profile?.avatarPreset)?.url ??
    null
  );
}
