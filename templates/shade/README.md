<img src="https://cdn.shopify.com/s/files/1/0753/6957/8736/files/shade_banner.jpg?v=1785479496" alt="Shade preview" />

**[View demo](https://tools.foxsell.app/tools/fox-demo-delight/store?app=foxsell-bundles-plus&path=/products/the-complete-lip-glow-set)**

## Overview

Shade folds the Mix & Match bundle builder directly into the product page instead of adding a separate summary panel — shoppers pick items from each category on the page itself, and their selections feed straight into the store's existing Add to Cart form. Product cards highlight as items are added, variants are picked via dropdowns or radios with color swatches, and an optional add-ons row lets shoppers extend their bundle before checkout. Built as a Shopify theme block, it drops into any page or template through the Theme Editor rather than requiring a dedicated product template. It suits stores that want the bundle experience to feel like a natural extension of the product page rather than a separate builder screen.

## What's included

Shade ships with a focused set of bundle, discovery, merchandising, and customization features:

**Bundle experience**
- Integrates directly with the theme's native Add to Cart form — no separate summary panel
- Category-based product selection with per-category quantities
- Add-ons row with automatic-add or opt-in checkbox strategies, selectable by default
- Quantity-aware options (QAO) support for variant-based cart submission
- Quick-view product modal

**Product discovery**
- Radio or dropdown variant pickers
- Color swatches, auto-detected from product options or manually mapped
- Selected-item highlighting on product cards
- Optional secondary image on hover
- Configurable image aspect ratio (original or square)

**Merchandising**
- Dynamic or fixed pricing strategies with per-item discount display
- Configurable discount label and free label for add-ons

**Customization**
- Full theme editor color scheme — background, text, two accent colors, borders
- Adjustable card/button border radius, swatch size, and base font size
- Configurable product grid gap and block padding
- Ships as a Shopify theme block with a bundle product picker — drag onto any page or template in the Theme Editor

## Best for

Beauty · Fragrance · Fashion · Hair care · Wellness

## Stores using this template

- [Nuuds](https://www.nuuds.com/products/pajama-pant-mauve)
- [Rugged Dog Company](https://ruggeddogcompany.com/products/jolly-pet-romp-n-roll-soccer-ball-bundle)
- [MiiR](https://www.miir.com/products/wide-mouth)
- [Juniper James Golf](https://juniperjamesgolf.com/collections/pants/products/play-on-pants-blue-smoke)

## Additional settings

Shade supports per-product **additional settings** from metafields. They are merged with defaults via `resolveAdditionalSettings()` and exposed on the JS config as `additionalSettings`.

### Source

`product.metafields.custom.foxsell_additional_settings`

Liquid reads this in `src/snippets/mix-match.liquid` and injects it into `#foxsell-config` as `additionalSettings`.

### Supported shape

```json
{
  "quantity_rules": {
    "strategy": "any",
    "max": "cap_at_highest"
  },
  "add_on_settings": {
    "strategy": "add_on_step"
  }
}
```

Defaults (from `DEFAULT_ADDITIONAL_SETTINGS` in `src/entries/js/constants.js`):

| Key | Default | Allowed values |
| --- | --- | --- |
| `quantity_rules.strategy` | `"any"` | `"any"` · `"fixed"` |
| `quantity_rules.max` | `"cap_at_highest"` | `"cap_at_highest"` · `"no_cap"` |
| `add_on_settings.strategy` | `"add_on_step"` | `"add_on_step"` · `"automatic_add"` |

### Behavior

| Setting | Effect |
| --- | --- |
| `quantity_rules.strategy` | QAO validation: `"any"` allows any quantity at or above the lowest option; `"fixed"` requires an exact option quantity |
| `quantity_rules.max` | `"cap_at_highest"` stops selection at the highest QAO tier; `"no_cap"` allows going past it |
| `add_on_settings.strategy` | `"add_on_step"` shows the add-ons row with opt-in checkbox; `"automatic_add"` adds add-ons automatically |

Partial or missing metafield values are filled from the defaults above.
