import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { categoryArt, palette } from "./category-icon-art.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = resolve(root, "public/category-icons/marten");
await mkdir(directory, { recursive: true });
const darkPalette = {
  ...palette,
  blue: "#6e9dbc",
  sky: "#b4d4e3",
  ink: "#7896a6",
  sage: "#98aa90",
  gold: "#d0b17a",
  clay: "#cc927b",
};
const names = new Set();
const values = new Set();
const catalog = [];
for (const { drawing, ...icon } of categoryArt) {
  const file = `${icon.name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}.svg`;
  if (names.has(file)) throw new Error(`Duplicate icon file: ${file}`);
  names.add(file);
  for (const emoji of [icon.emoji, ...icon.aliases]) {
    const normalized = emoji.replace(/\uFE0F/g, "");
    if (values.has(normalized)) throw new Error(`Duplicate emoji: ${emoji}`);
    values.add(normalized);
  }
  await writeFile(
    resolve(directory, file),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">${drawing}</svg>\n`,
  );
  const darkFile = file.replace(".svg", "-dark.svg");
  // Replace in one pass so a replacement cannot be interpreted as a source color.
  const darkDrawing = drawing.replace(/#[0-9a-f]{6}/gi, (color) => {
    const key = Object.keys(palette).find((key) => palette[key] === color);
    return key ? darkPalette[key] : color;
  });
  await writeFile(
    resolve(directory, darkFile),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">${darkDrawing}</svg>\n`,
  );
  catalog.push({
    ...icon,
    file: `marten/${file}`,
    darkFile: `marten/${darkFile}`,
  });
}
await writeFile(
  resolve(root, "src/lib/categoryIcons.json"),
  `${JSON.stringify(catalog, null, 2)}\n`,
);
await writeFile(
  resolve(directory, "sources.json"),
  `${JSON.stringify(
    {
      name: "Marten category illustrations",
      version: 1,
      authorship:
        "Original SVG pictograms authored for Marten. No third-party vector paths.",
      direction:
        "Built-in image-generation style exploration, selected by Drew on September 12, 2026.",
      source: "scripts/category-icon-art.mjs",
      palette,
      darkPalette,
      icons: catalog.map(({ emoji, name, file }) => ({ emoji, name, file })),
    },
    null,
    2,
  )}\n`,
);
const escape = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const sections = [...new Set(catalog.map((i) => i.group))]
  .map(
    (group) =>
      `<section><h2>${escape(group)}</h2><div class="grid">${catalog
        .filter((i) => i.group === group)
        .map(
          (i) =>
            `<figure><div class="pair"><div class="light"><img src="/category-icons/${i.file}" width="64" height="64"><img src="/category-icons/${i.file}" width="24" height="24"></div><div class="dark"><img src="/category-icons/${i.darkFile}" width="64" height="64"><img src="/category-icons/${i.darkFile}" width="24" height="24"></div></div><figcaption>${escape(i.name)}</figcaption></figure>`,
        )
        .join("")}</div></section>`,
  )
  .join("");
await writeFile(
  resolve(root, "docs/design/category-icons/review.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Marten category artwork review</title><style>body{font:14px system-ui;background:#f7f6f2;color:#344956;margin:0;padding:32px}main{max-width:1280px;margin:auto}h1{font-size:28px;margin:0 0 8px}h2{font-size:18px;margin:30px 0 12px}p{line-height:1.6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:20px}figure{margin:0}.pair{display:flex}.pair>div{width:50%;display:flex;align-items:center;justify-content:center;gap:10px;padding:16px 4px}.light{background:#fff}.dark{background:#242421}figcaption{padding-top:8px}img{object-fit:contain}</style><main><h1>Marten category artwork</h1><p>${catalog.length} original pictograms · 64px and 24px · light and dark surfaces</p>${sections}</main></html>\n`,
);
console.log(
  `Generated ${catalog.length} Marten illustrations with ${values.size} portable emoji mappings.`,
);
