![Reserve banner](https://cdn.shopify.com/s/files/1/0753/6957/8736/files/reserve_banner.jpg?v=1785479496)

## Overview

Reserve is a compact Mix & Match bundle builder that lives directly inside a theme block on the product page, rather than a standalone section — no separate summary panel or modal, so the running total and discount update inline near the add-to-cart button. Categories with more than one option collapse into an accordion-style dropdown that previews the selected item and closes automatically when another category opens or the shopper clicks away, while single-item categories auto-add their sole variant. It suits beauty, fragrance, hair care, and wellness merchants who want a lightweight, build-your-own bundle experience embedded right on the PDP.

## What's included

This template ships with the following out of the box:

**Bundle experience**
- Accordion-style category dropdowns with live selection preview
- Auto-add for single-product, single-variant categories
- Inline price and discount display next to the add-to-cart button
- Add-ons with automatic-add or manual-add strategy
- Configurable "Free" label for $0 add-ons
- Dynamic percentage discount or fixed pricing strategies

**Product discovery**
- Variant swatch cards with quantity controls
- Optional secondary image on hover
- Original or square product card image aspect ratio

**Merchandising**
- Compare-at / sale price display with discount badge
- Add-on line item properties passed through to cart

**Customization**
- Theme editor color scheme (background, text, accent, border)
- Card and button border radius controls
- Base font size setting
- Category preview placeholder image
- Locale text labels (select item, select add-on, discount, free, add-to-cart, add-to-bundle)

## Best for

Beauty · Fragrance · Hair care · Wellness

## Additional settings

Reserve supports per-product **additional settings** from metafields. They are merged with defaults via `resolveAdditionalSettings()` and exposed on the JS config as `additionalSettings`.

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
| `add_on_settings.strategy` | `"add_on_step"` shows add-ons as a manual accordion dropdown; `"automatic_add"` adds add-ons automatically |

Partial or missing metafield values are filled from the defaults above.
