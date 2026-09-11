import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import * as icons from "simple-icons";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = dirname(fileURLToPath(import.meta.resolve("simple-icons")));
const metadata = JSON.parse(
  await readFile(resolve(packageRoot, "data/simple-icons.json"), "utf8"),
);
const { version } = JSON.parse(
  await readFile(resolve(packageRoot, "package.json"), "utf8"),
);
const output = resolve(root, "public/brands/catalog");
await mkdir(output, { recursive: true });
const bySlug = new Map(Object.values(icons).map((icon) => [icon.slug, icon]));
const index = [];
let totalBytes = 0;
async function writeChanged(path, content) {
  if ((await readFile(path, "utf8").catch(() => null)) !== content)
    await writeFile(path, content);
}
for (const item of metadata) {
  const icon = bySlug.get(item.slug);
  if (
    !icon ||
    !/^[a-z0-9_-]+$/.test(item.slug) ||
    !/^[A-Fa-f0-9]{6}$/.test(icon.hex)
  )
    throw new Error(`Invalid catalog entry: ${item.slug}`);
  if (!/^[a-zA-Z0-9., +\-]*$/.test(icon.path))
    throw new Error(`Unexpected SVG path: ${item.slug}`);
  const rgb = [0, 2, 4].map((offset) =>
    parseInt(icon.hex.slice(offset, offset + 2), 16),
  );
  const backing =
    rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 225
      ? "#24262b"
      : "#ffffff";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="${backing}"/><path transform="translate(8 8) scale(1.3333333333)" fill="#${icon.hex}" d="${icon.path}"/></svg>\n`;
  await writeChanged(resolve(output, `${item.slug}.svg`), svg);
  totalBytes += Buffer.byteLength(svg);
  const localized = Object.values(item.aliases?.loc ?? {}).flat();
  index.push([
    item.slug,
    [...new Set([item.title, ...(item.aliases?.aka ?? []), ...localized])],
  ]);
}
index.sort((a, b) => a[0].localeCompare(b[0], "en"));
await writeChanged(
  resolve(root, "src/lib/brandCatalog.json"),
  `${JSON.stringify(index)}\n`,
);
await writeChanged(
  resolve(output, "sources.json"),
  `${JSON.stringify({ version, entries: metadata })}\n`,
);
for (const name of ["LICENSE.md", "DISCLAIMER.md"])
  await writeChanged(
    resolve(output, name),
    await readFile(resolve(packageRoot, name), "utf8"),
  );
console.log(
  `Generated ${index.length} local brand icons from Simple Icons ${version} (${Math.round(totalBytes / 1024)} KiB).`,
);
