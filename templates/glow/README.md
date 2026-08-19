![Glow banner](https://cdn.shopify.com/s/files/1/0753/6957/8736/files/glow_banner.jpg?v=1785479496)

**[View demo](https://tools.foxsell.app/tools/fox-demo-delight/store?app=foxsell-bundles-plus&path=/products/build-your-own-cookie-box)**

## Overview

Glow is a two-step Mix & Match bundle builder: shoppers pick their core items first, then continue on to a curated add-ons step before checking out — all without leaving the product page. Category pills let shoppers jump straight to the section they want, a sticky summary tracks progress and pricing as they go, and a quick-view modal keeps browsing fast. It suits merchants who want a guided, build-your-own experience rather than a single flat grid of choices.

## What's included

Everything needed to run a two-step Mix & Match bundle builder on any product page.

**Bundle experience**
- Two-step build flow — items first, then add-ons, with Continue / Return controls
- Category navigation pills to filter the grid by category, plus an "All" view
- Sticky bundle summary with live quantity, progress messaging, and line-item removal
- Optional manual quantity-tier selection — shoppers click a QAO tier instead of unlocking by item count
- Configurable "Free" label for $0 add-ons and dynamic-pricing discounts
- Product modal for a quick add without leaving the page

**Product discovery**
- Responsive product grid (1–2 columns on mobile, up to 5 on desktop)
- Card and modal views with radio or select variant pickers
- Color swatches, auto-detected from a named option or mapped manually
- Optional secondary image on hover
- Square or original image aspect ratio

**Merchandising**
- Dynamic pricing discounts reflected on cards and summary line items
- Automatic or manual add-on strategies
- Compare-at / sale price display wherever a discount applies

**Customization**
- Full color scheme — background, text, two accent pairs, border
- Card and button border radius
- Section padding, base font size, and scroll offset controls
- Editable copy for every button and label (add to cart, add to bundle, continue/return, category "All", add-ons tag, free label, and more)
- Works as a section or as an app block

## Best for

Build-your-own boxes · Curated kits · Beauty · Fragrance · Hair care · Fashion · Gifting · Wellness · Food & drink · Multi-category bundles

## Stores using this template

![Stores using Glow](https://cdn.shopify.com/s/files/1/0753/6957/8736/files/stores_using_glow.jpg?v=1787054472)

## Additional settings

Glow supports per-product **additional settings** from metafields. They are merged with defaults via `resolveAdditionalSettings()` and exposed on the JS config as `additionalSettings`.

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
| `add_on_settings.strategy` | `"add_on_step"` shows the add-ons step UI; `"automatic_add"` hides that step and adds add-ons automatically |

Partial or missing metafield values are filled from the defaults above.
