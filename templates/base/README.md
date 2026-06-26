# FoxSell Base Template

The Base template is the general-purpose FoxSell dynamic add-ons bundle layout. It includes configurable product cards, bundle summary, product modal, color settings, spacing controls, progress messages, and a product JSON template for assigning the layout to a bundle product.

## Files

| Directory | Files | Purpose |
| --- | --- | --- |
| `assets/` | `foxsell-base.css`, `foxsell-base.js` | Shared styling and bundle interaction behavior. |
| `sections/` | `foxsell-base-mix-match.liquid`, `foxsell-base-product-modal.liquid` | Main bundle section and product modal section. |
| `snippets/` | `foxsell-base-*.liquid` | Product cards, options, bundle summary, CSS variables, overrides, and main bundle rendering. |
| `templates/` | `product.foxsell-base.json` | Product template that places the Base bundle section on a product page. |

## Features

- Dynamic add-ons bundle rendering from the selected bundle product.
- Configurable product grid columns, spacing, colors, borders, and border radius.
- Product cards with variant selectors, color swatches, and optional secondary image on hover.
- Bundle summary with configurable button and price labels.
- Progress message settings for bundle quantity requirements.
- Product modal for viewing bundle item details.

## Installation

1. Copy the files from each directory into the matching Shopify theme directory.
2. Assign `product.foxsell-base.json` to the FoxSell bundle product, or add the `FoxSell Base` section manually in the Theme Editor.
3. Select the bundle product in the `Bundle product` setting.
4. Configure the layout, colors, product cards, and locale text from the section settings.

## Notes

- The section renders only when the selected product has FoxSell dynamic add-ons bundle configuration.
- Use this template as the default starting point when a bundle does not require a more specialized visual style.
