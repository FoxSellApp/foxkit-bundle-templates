# FoxSell Glow Template

The Glow template is a polished FoxSell dynamic add-ons bundle layout with configurable styling, product cards, bundle summary, product modal, progress messages, and a product JSON template for assigning the layout to a bundle product.

## Files

| Directory | Files | Purpose |
| --- | --- | --- |
| `assets/` | `foxsell-glow.css`, `foxsell-glow.js` | Styling and bundle interaction behavior. |
| `sections/` | `foxsell-glow-mix-match.liquid`, `foxsell-glow-product-modal.liquid` | Main bundle section and product modal section. |
| `snippets/` | `foxsell-glow-*.liquid` | Product cards, options, bundle summary, CSS variables, overrides, and main bundle rendering. |
| `templates/` | `product.foxsell-glow.json` | Product template that places the Glow bundle section on a product page. |

## Features

- Dynamic add-ons bundle rendering from the selected bundle product.
- Configurable section padding, wrapper classes, colors, radius, and product grid.
- Product cards with variant selectors and swatch support.
- Bundle summary with configurable labels and add-to-cart text.
- Progress message settings for bundle quantity requirements.
- Product modal for item details.

## Installation

1. Copy the files from each directory into the matching Shopify theme directory.
2. Assign `product.foxsell-glow.json` to the FoxSell bundle product, or add the `FoxSell Glow` section manually in the Theme Editor.
3. Select the bundle product in the `Bundle product` setting.
4. Configure styling, product card behavior, progress messages, and locale text from the section settings.

## Notes

- The section renders only when the selected product has FoxSell dynamic add-ons bundle configuration.
- Use this template when the store needs a ready-made visual treatment with broad Theme Editor controls.
