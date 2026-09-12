# Brand and category artwork

Marten bundles the following identification icons in `public/brands/`. They are served from the app itself. Rendering an icon does not send merchant names, account names, or financial data to an image service. No logo service, API key or external runtime lookup is used. The complete Simple Icons development dependency generates an additional catalog before dev/build.

`src/lib/brandLogos.ts` exposes `brandLogo(name): string | null`. It matches generated catalog titles and official aliases plus a reviewed list of aliases after Unicode normalization, case folding, trimming, and whitespace normalization. It does not infer a brand from a transaction statement or a substring. Unknown names retain the initials fallback.

The presentation order is an uploaded/provider-supplied logo first, then `brandLogo(name)`, then initials. Local SVGs have a white circular backing and optical padding already included. Render them with `object-fit: contain` and a white avatar background; do not apply the placeholder's colored background or another internal image padding layer.

## Generated catalog

`simple-icons@16.30.0` is pinned in the lockfile. `npm run assets:brands` runs `scripts/generate-brand-catalog.mjs`, which validates the installed metadata and paths, creates 3,459 SVGs in `public/brands/catalog/`, and writes the compact lookup in `src/lib/brandCatalog.json`. The `predev` and `prebuild` hooks run this generator automatically. A clean checkout needs `npm ci` first. Generation uses local dependency files, not an image-service request. Generated images total about 5 MiB and are served individually when needed; they are not loaded together into the page.

The generated directory is ignored by Git and recreated deterministically. Its `sources.json`, `LICENSE.md` and `DISCLAIMER.md` retain upstream provenance. Existing reviewed aliases/artwork take precedence. Ambiguous normalized names are excluded, and raw transaction descriptors are not guessed from substrings. The catalog improves broad coverage but does not cover every merchant or bank. A failed provider/user image now falls back to a known local logo before initials.

A runtime logo API was considered: [Logo.dev](https://www.logo.dev/pricing) offers a free request tier, but self-hosting its returned artwork is a paid-plan feature. Marten instead bundles the open catalog and sends no merchant queries to that service. No account, API key or subscription was created.

## Original curated Simple Icons

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

## Additional reviewed merchants

- `traderjoes.svg`: the unchanged red wordmark from [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Trader_Joes_Logo.svg), whose source is a Trader Joe's flyer. The page labels the text logo public domain, with trademark restrictions retained. The original [SVG](https://upload.wikimedia.org/wikipedia/commons/d/d1/Trader_Joes_Logo.svg) is embedded byte-for-byte on a white canvas (SHA-256 `503e83d3207938d283c565f96f2bdfa09fac55a8184b5624d72d735d205edb6a`).
- `walgreens.svg`: the unchanged [Walgreens website branding SVG](https://www.walgreens.com/images/adaptive/livestyleguide/v5/icons/Branding.svg), embedded within a white circular canvas. This first-party artwork retains the brand's ownership and is not described as CC0.

## Category illustrations

Marten’s **89 original category pictograms** are bundled in `public/category-icons/marten/`. The library replaces the earlier 21-icon Fluent Emoji subset. It covers money, home and bills, food, transport, travel, shopping, healthcare, leisure, learning and work, family and giving, and everyday organization.

The [approved style exploration](design/category-icons/style-concept.png) was made with the built-in image-generation tool. The production assets are original, code-authored SVG drawings translated from that direction, rather than cropped raster images or third-party emoji paths. Shapes, palette, keywords, and aliases live in [`scripts/category-icon-art.mjs`](../scripts/category-icon-art.mjs); `npm run assets:categories` regenerates the committed light/dark SVGs, metadata, and [review sheet](design/category-icons/review.html). The full generation prompt and visual contract are in [the library guide](design/category-icons/README.md). Runtime rendering never calls an image service.

`CategoryIcon` maps known emoji and compatibility aliases to illustrations; it retains the system emoji for unknown values. Existing stored values, exports, and imports remain unchanged. For example, the old sparkle displays as a money pouch in Illustrated mode but keeps its original stored emoji. This is a presentation lookup, not a category-name inference or data migration. The active app theme chooses the corresponding SVG palette; Preferences → Appearance → System emoji bypasses the illustrations.

The category editor offers searchable collections and still accepts custom emoji. Each artwork is reviewed at 24 and 64 pixels on light and dark surfaces. Category names from an authorized read-only Monarch review informed coverage; no private financial data or competitor artwork is included in the assets or fixtures.

### Additional reviewed merchant icons

Sweetgreen uses its official [site icon](https://www.sweetgreen.com/icon.svg),
saved as `public/brands/sweetgreen.svg`. Equinox uses its official
[favicon](https://assets.cdn-equinox.com/images/favicon.png), saved as
`public/brands/equinox.png`. Retrieved September 12, 2026 for merchant
identification. Both load locally; no transaction names are sent to a logo
service. Exact reviewed aliases include their common billing names.
