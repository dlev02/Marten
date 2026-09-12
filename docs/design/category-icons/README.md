# Marten category library

The library has 89 original SVG pictograms in 11 collections. Drew selected the illustrated direction on September 12, 2026. The starting point was an image-generated review sheet, followed by original vector construction for consistent sizing and editable geometry. The production icons are not image-generation outputs or modified Microsoft assets.

## Visual contract

- 32 × 32 viewBox; transparent canvas. Most subjects occupy 26–28 units, with optical adjustments for narrow objects.
- Rounded flat silhouettes; typically two to four colors. Interior lines generally use 2 units. No texture, gradients, shadows, letter labels, or decorative sparkle marks.
- Light palette: petrol `#356587`, sky `#83b8d5`, sage `#82947c`, ochre `#c8a66a`, terracotta `#be806a`, cream `#ece4d3`, slate `#344956`, pale blue `#c6d6df`.
- Dark palette lifts the main shapes and thin details: petrol `#6e9dbc`, sky `#b4d4e3`, sage `#98aa90`, ochre `#d0b17a`, terracotta `#cc927b`, slate `#7896a6`. Cream and pale blue stay shared. This follows the app theme, not the operating system independently.
- Familiar objects carry meaning: a controller for games, train for transit, bottle/capsule for pharmacy, tooth for dental, and a curled inset inside the protective shield. The marten stays the product mark.
- Recognition comes before detail. The production hotel omits lettering, the parcel omits its bow, and the fitness icon uses a clear barbell.

## Coverage and portability

A read-only review of the authorized Monarch category settings, including inactive entries, guided the subject list. The inventory covers the everyday concepts represented there, plus useful alternatives such as buses, cycling, pets, outdoors, and vision care. Private names and financial data are not fixtures; the catalog uses general-purpose labels and search terms.

The catalog offers appropriate choices for all reviewed concepts; it does not assign icons by guessing a user's category name. Similar categories can share a subject. For example, rent and mortgage can use Home; different delivery purchases can use Postage & shipping; wages can use Paychecks. Users choose the meaning that fits their own category.

The original 21 stored emoji remain supported, including the sparkle compatibility alias for Other income. Unknown emoji render natively, and System emoji mode preserves the exact saved value. Aliases never silently rewrite stored categories. The library contains 106 normalized emoji mappings, including canonical values and aliases.

## Source and review

- [Approved concept](style-concept.png)
- [Production review sheet](review.html): serve through Vite; displays every icon at 64px and 24px on both theme surfaces.
- [Artwork source](../../../scripts/category-icon-art.mjs)
- [Generator](../../../scripts/generate-category-icons.mjs): `npm run assets:categories`
- [Catalog tests](../../../src/lib/categoryIcons.test.ts)

Generated files are committed. Edit the artwork source, regenerate once, and inspect the affected collection in the review sheet and the real category picker. A color change belongs in the palette; do not recolor unrelated assets individually. The tests guard alias uniqueness, asset availability, legacy emoji compatibility, and realistic search queries.

## Image-generation provenance

Tool: built-in `image_gen` (no API/CLI fallback). Reference: `public/marten-mark.png`, used only for brand direction. Output: `style-concept.png`. The user selected “Keep this direction.”

Prompt:

> Use case: logo-brand. Create a polished visual style exploration sheet for an ORIGINAL custom category icon library for Marten, a calm premium personal finance app. The reference image is the existing Marten logo: use ONLY as brand/style reference for graceful rounded silhouette geometry, never repeat the mascot inside every icon. One landscape contact sheet, 4 columns by 3 rows, on a solid warm ivory background #f7f6f2. Header 'Marten' and small title 'Everyday, thoughtfully drawn'. Exactly twelve large distinctive standalone flat pictographic illustrations, each with a tiny neat sans serif label below. Row 1: Game controller (label Gaming), petrol-blue compact car (Car payments), gas pump (Fuel), sage subway train front (Transit). Row 2: cozy small hotel building (Stays), small awning storefront (Convenience), tied parcel with postal stamp (Shipping), pill capsule and small medicine bottle (Pharmacy). Row 3: comb and scissors (Haircuts), friendly simple molar tooth (Dental), protective shield with subtle curved inset, NO medical cross (Insurance), soft gathered money pouch with two coins, NO sparkle (Other income). Art direction: adult-friendly Scandinavian pictograms, filled flat vector-like silhouettes, gently rounded corners and graceful confident curves echoing the logo tail, limited broad interior details. Purpose: these must read at 24 pixels. No hairline details, no busy backgrounds, no shadows, no gradients, no texture, no skeuomorphism, no 3D, no outline-only icon library. Each icon uses 2-4 flat colors ONLY from muted petrol #356587, lighter blue #83b8d5, sage #82947c, warm ochre #c8a66a, terracotta #be806a, cream #ece4d3 and deep slate #344956. Consistent perceived size, level of detail and optical weight; plenty of whitespace. Clearly original illustrations, not copied from Fluent Emoji or Apple emoji. The design should feel like one lovingly art-directed family, charming through forms rather than faces. This is a review contact sheet, not a screenshot of an app.
