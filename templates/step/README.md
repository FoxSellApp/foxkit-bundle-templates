![Step](https://cdn.shopify.com/s/files/1/0753/6957/8736/files/step_banner.jpg?v=1785479496)

**[View demo](https://tools.foxsell.app/tools/fox-demo-delight/store?app=foxsell-bundles-plus&path=/products/4-step-skin-care-bundle)**

## Overview

Step turns Mix & Match into a guided, one-category-at-a-time journey. Shoppers move through named steps with Back and Next, meet quantity rules per step, and watch progress update in a sticky summary before add to cart. An optional add-ons step can close the flow. It suits brands that sell routines, kits, and build-your-own sets where a clear sequence matters more than an all-at-once grid.

## What's included

Built around a step-by-step Mix & Match flow — shoppers finish one step before the next unlocks.

**Step-by-step experience**
- One category per step (guided journey)
- Named steps with titles and descriptions
- Back / Next with per-step validation
- Unlock Next only when the step minimum is met
- Step progress bar (“Step X of Y”)
- Sticky summary grouped by step
- Optional add-ons as a final step
- Add to cart on the last completed step

**Product discovery**
- Product grid and cards
- Product modal
- Radio or select variant pickers
- Color swatches
- Secondary image on hover
- Quantity steppers on cards

**Merchandising**
- Bundle pricing and discounts
- Per-step quantity rules (exact, range, minimum, optional)
- Add-on products

**Marketing and conversion**
- Configurable step progress and empty-state copy
- Locale labels for buttons and rules
- Sticky summary on desktop; collapsible on mobile

**Customization**
- Theme editor colors and accents
- Card and button radii
- Grid columns and gap
- Image aspect ratio and product-card toggles

## Best for

Build-your-own boxes · Curated kits · Beauty · Hair care

## Additional settings

Step supports per-product **additional settings** from metafields. They are merged with defaults via `resolveAdditionalSettings()` and exposed on the JS config as `additionalSettings`.

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
    "strategy": "add_on_step",
    "title": "Add-ons",
    "description": ""
  },
  "categories_metadata": [
    {
      "title": "Step 1",
      "description": "Pick your cleanser",
      "min_quantity": 1,
      "max_quantity": 1
    }
  ]
}
```

Defaults (from `DEFAULT_ADDITIONAL_SETTINGS` in `src/entries/js/constants.js`, with per-step metadata falling back to category data in Liquid):

| Key | Default | Allowed values |
| --- | --- | --- |
| `quantity_rules.strategy` | `"any"` | `"any"` · `"fixed"` |
| `quantity_rules.max` | `"cap_at_highest"` | `"cap_at_highest"` · `"no_cap"` |
| `add_on_settings.strategy` | `"add_on_step"` | `"add_on_step"` · `"automatic_add"` |
| `add_on_settings.title` | — | string (add-ons step title) |
| `add_on_settings.description` | — | string (add-ons step description) |
| `categories_metadata[].title` | `"Step N"` | string (step title in the journey table) |
| `categories_metadata[].description` | category title | string (step description) |
| `categories_metadata[].min_quantity` | category quantity | number (required before Next unlocks) |
| `categories_metadata[].max_quantity` | category quantity | number (selection cap for that step) |

### Behavior

| Setting | Effect |
| --- | --- |
| `quantity_rules.strategy` | QAO validation: `"any"` allows any quantity at or above the lowest option; `"fixed"` requires an exact option quantity |
| `quantity_rules.max` | `"cap_at_highest"` stops selection at the highest QAO tier; `"no_cap"` allows going past it |
| `add_on_settings.strategy` | `"add_on_step"` shows add-ons as a final step; `"automatic_add"` hides that step and adds add-ons automatically |
| `add_on_settings.title` / `description` | Labels for the optional add-ons step |
| `categories_metadata` | Per-step title, description, and min/max quantity for the guided journey |

Partial or missing metafield values are filled from the defaults above.
