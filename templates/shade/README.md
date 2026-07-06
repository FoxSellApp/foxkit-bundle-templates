# FoxSell Shade Template

The Shade template is a FoxSell dynamic add-ons bundle app block. It is designed for themes that support product page blocks and need bundle placement inside an existing product template instead of a separate product JSON template.

## Files

| Directory | Files | Purpose |
| --- | --- | --- |
| `assets/` | `foxsell-shade.css`, `foxsell-shade.js` | Styling and bundle interaction behavior. |
| `blocks/` | `foxsell-shade.liquid` | Theme app block used to place the bundle in the Theme Editor. |
| `sections/` | `foxsell-shade-product-modal.liquid` | Product modal section. |
| `snippets/` | `foxsell-shade-*.liquid` | Product cards, options, CSS variables, overrides, and main bundle rendering. |

## Features

- App block placement for product pages.
- Dynamic add-ons bundle rendering from the current product or selected bundle product.
- Configurable product cards, variant style, swatches, colors, radius, and button text.
- Product modal for item details.
- Works without adding a dedicated product JSON template.

## Demo

[View the cosmetic bundle demo](https://tools.foxsell.app/tools/fox-demo-delight/store?app=foxsell-bundles-plus&path=/products/the-complete-lip-glow-set) to see Shade used for a complete lip glow set with more than three selectable options, 4,000+ variant combinations, and a makeup bag upsell.

## Installation

1. Copy the files from each directory into the matching Shopify theme directory.
2. Add the `FoxSell Shade` block to the product page in the Shopify Theme Editor.
3. Optionally select a bundle product in the block settings. If left blank, the block uses the current product.
4. Configure product card settings, colors, spacing, and locale text from the block settings.

## Notes

- The block renders only when the resolved product has FoxSell dynamic add-ons bundle configuration.
- Use this template when bundle placement should live inside an existing product page layout.
