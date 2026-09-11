# Brand artwork

Marten bundles the following identification icons in `public/brands/`. They are served from the app itself. Rendering an icon does not send merchant names, account names, or financial data to an image service. No logo service, API key, runtime lookup, or icon package dependency is used.

`src/lib/brandLogos.ts` exposes `brandLogo(name): string | null`. It matches only an explicit list of aliases after Unicode normalization, case folding, trimming, and whitespace normalization. It does not infer a brand from a transaction statement or a substring. Unknown names retain the initials fallback.

The presentation order is an uploaded/provider-supplied logo first, then `brandLogo(name)`, then initials. Local SVGs have a white circular backing and optical padding already included. Render them with `object-fit: contain` and a white avatar background; do not apply the placeholder's colored background or another internal image padding layer.

## Simple Icons

The vector paths and listed brand colors are from [Simple Icons](https://github.com/simple-icons/simple-icons), pinned to commit [`5d5d4d1d28cbb00b21770bb69d8112da52211a95`](https://github.com/simple-icons/simple-icons/tree/5d5d4d1d28cbb00b21770bb69d8112da52211a95). Source metadata is the pinned [`data/simple-icons.json`](https://github.com/simple-icons/simple-icons/blob/5d5d4d1d28cbb00b21770bb69d8112da52211a95/data/simple-icons.json). The brand paths are unchanged; each is placed within a white circular SVG canvas and filled with its catalog color.

| Local file            | Brand            | Color     | Pinned SVG source                                                                                                           | Brand/source link listed by Simple Icons                                                                       |
| --------------------- | ---------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `americanexpress.svg` | American Express | `#2E77BC` | [SVG](https://github.com/simple-icons/simple-icons/blob/5d5d4d1d28cbb00b21770bb69d8112da52211a95/icons/americanexpress.svg) | [Source](<https://commons.wikimedia.org/wiki/File:American_Express_logo_(2018).svg>)                           |
| `apple.svg`           | Apple            | `#000000` | [SVG](https://github.com/simple-icons/simple-icons/blob/5d5d4d1d28cbb00b21770bb69d8112da52211a95/icons/apple.svg)           | [Apple](https://www.apple.com)                                                                                 |
| `chase.svg`           | Chase            | `#117ACA` | [SVG](https://github.com/simple-icons/simple-icons/blob/5d5d4d1d28cbb00b21770bb69d8112da52211a95/icons/chase.svg)           | [Source](https://commons.wikimedia.org/wiki/File:Chase_logo_2007.svg)                                          |
| `netflix.svg`         | Netflix          | `#E50914` | [SVG](https://github.com/simple-icons/simple-icons/blob/5d5d4d1d28cbb00b21770bb69d8112da52211a95/icons/netflix.svg)         | [Brand assets](https://brand.netflix.com/en/assets/logos)                                                      |
| `shell.svg`           | Shell            | `#FFD500` | [SVG](https://github.com/simple-icons/simple-icons/blob/5d5d4d1d28cbb00b21770bb69d8112da52211a95/icons/shell.svg)           | [Source](https://en.wikipedia.org/wiki/File:Shell_logo.svg)                                                    |
| `spotify.svg`         | Spotify          | `#1ED760` | [SVG](https://github.com/simple-icons/simple-icons/blob/5d5d4d1d28cbb00b21770bb69d8112da52211a95/icons/spotify.svg)         | [Design and branding](https://developer.spotify.com/documentation/general/design-and-branding/#using-our-logo) |
| `starbucks.svg`       | Starbucks        | `#006241` | [SVG](https://github.com/simple-icons/simple-icons/blob/5d5d4d1d28cbb00b21770bb69d8112da52211a95/icons/starbucks.svg)       | [Creative guidelines](https://creative.starbucks.com)                                                          |
| `target.svg`          | Target           | `#CC0000` | [SVG](https://github.com/simple-icons/simple-icons/blob/5d5d4d1d28cbb00b21770bb69d8112da52211a95/icons/target.svg)          | [Target](https://www.target.com)                                                                               |
| `uber.svg`            | Uber             | `#000000` | [SVG](https://github.com/simple-icons/simple-icons/blob/5d5d4d1d28cbb00b21770bb69d8112da52211a95/icons/uber.svg)            | [Brand assets](https://assets.uber.com/d/k4nuxdZ8MC7E/logos/collection/151)                                    |
| `unitedairlines.svg`  | United Airlines  | `#002244` | [SVG](https://github.com/simple-icons/simple-icons/blob/5d5d4d1d28cbb00b21770bb69d8112da52211a95/icons/unitedairlines.svg)  | [United Airlines](https://www.united.com)                                                                      |

The Simple Icons collection is distributed under CC0 1.0. The complete license and the project's disclaimer are retained in [`public/brands/simple-icons-LICENSE.md`](../public/brands/simple-icons-LICENSE.md) and [`public/brands/simple-icons-DISCLAIMER.md`](../public/brands/simple-icons-DISCLAIMER.md). As the project's disclaimer explains, the collection license does not grant trademark rights or supersede an individual brand's terms.

## Official website artwork

These images come directly from public first-party brand pages. Each original PNG is embedded byte-for-byte in a self-contained SVG with a white backing; the logo is not cropped, recolored, or redrawn. These assets remain the property of their respective owners and are not described as CC0.

| Local file       | Source page                                                      | Original asset                                                                                                                                                     |
| ---------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `amazon.svg`     | [Amazon Press Center logos](https://press.aboutamazon.com/logos) | [Amazon wordmark, squid ink and smile orange](https://assets.aboutamazon.com/2e/d7/ac71f1f344c39f8949f48fc89e71/amazon-logo-squid-ink-smile-orange.png)            |
| `wholefoods.svg` | [Amazon Press Center logos](https://press.aboutamazon.com/logos) | [Whole Foods Market circle logo, kale green](https://assets.aboutamazon.com/cd/a2/554a9acc4dc88781baa9b52ff17b/wholefoodsmarket-logo-kale-green-rgb.png)           |
| `amc.svg`        | [AMC investor website](https://investor.amctheatres.com/)        | [Official website touch icon](https://d1io3yog0oux5.cloudfront.net/_ce4b8f557a6ac0a53cf0cf1cca206348/amctheatres/files/theme/images/favicons/apple-touch-icon.png) |

Artwork identifies merchants and institutions; it does not imply affiliation, sponsorship, or endorsement. These icons are separate from the fictional sample transaction values. No Monarch assets are included.

Schwab is not mapped in the local fallback catalog: it was absent from this Simple Icons snapshot, and the public asset endpoints checked during this pass did not return usable artwork. A supplied Schwab logo still takes precedence over initials through the normal account-logo path.

Retrieved September 11, 2026 UTC. The 13 self-contained icon files total approximately 262 KiB; no runtime dependency was added.
