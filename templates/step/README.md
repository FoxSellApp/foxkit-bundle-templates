# FoxSell Step Template

The Step template is a guided dynamic add-ons bundle layout. It includes the standard bundle rendering files plus quantity rule support and progress messaging for stores that want customers to complete a bundle in clear steps.

## Files

| Directory | Files | Purpose |
| --- | --- | --- |
| `assets/` | `foxsell-step.css`, `foxsell-step.js` | Styling and bundle interaction behavior. |
| `sections/` | `foxsell-step-mix-match.liquid`, `foxsell-step-product-modal.liquid` | Main bundle section and product modal section. |
| `snippets/` | `foxsell-step-*.liquid` | Product cards, options, quantity rules, bundle summary, CSS variables, overrides, and main bundle rendering. |
| `templates/` | `product.foxsell-step.json` | Product template that places the Step bundle section on a product page. |

## Features

- Dynamic add-ons bundle rendering from the selected bundle product.
- Quantity rule snippet for step-based bundle requirements.
- Progress messages for incomplete, complete, and over-limit states.
- Configurable product grid, product card settings, colors, and button text.
- Product modal for item details.

## Installation

1. Copy the files from each directory into the matching Shopify theme directory.
2. Assign `product.foxsell-step.json` to the FoxSell bundle product, or add the `FoxSell Step` section manually in the Theme Editor.
3. Select the bundle product in the `Bundle product` setting.
4. Configure quantity messaging, product grid settings, colors, and locale text from the section settings.

## Notes

- The section renders only when the selected product has FoxSell dynamic add-ons bundle configuration.
- Use this template when the bundle flow depends on visible quantity requirements or a guided completion state.
