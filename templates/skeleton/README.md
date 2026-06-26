# FoxSell Skeleton Template

The Skeleton template is a minimal FoxSell dynamic add-ons bundle starter. It provides the core Liquid, JavaScript, CSS, product cards, product modal, bundle summary, and product JSON template with a lighter configuration surface for custom implementations.

## Files

| Directory | Files | Purpose |
| --- | --- | --- |
| `assets/` | `foxsell-skeleton.css`, `foxsell-skeleton.js` | Base styling and bundle interaction behavior. |
| `sections/` | `foxsell-skeleton-mix-match.liquid`, `foxsell-skeleton-product-modal.liquid` | Main bundle section and product modal section. |
| `snippets/` | `foxsell-skeleton-*.liquid` | Product cards, options, bundle summary, CSS variables, overrides, and main bundle rendering. |
| `templates/` | `product.foxsell-skeleton.json` | Product template that places the Skeleton bundle section on a product page. |

## Features

- Minimal dynamic add-ons bundle rendering.
- Product cards with variant selection.
- Bundle summary and add-to-cart flow.
- Product modal for item details.
- Basic color, radius, grid, and progress message settings.

## Installation

1. Copy the files from each directory into the matching Shopify theme directory.
2. Assign `product.foxsell-skeleton.json` to the FoxSell bundle product, or add the `FoxSell Skeleton` section manually in the Theme Editor.
3. Select the bundle product in the `Bundle product` setting.
4. Customize the snippets and CSS when a highly tailored bundle layout is needed.

## Notes

- The section renders only when the selected product has FoxSell dynamic add-ons bundle configuration.
- This is the best starting point for custom template development.
