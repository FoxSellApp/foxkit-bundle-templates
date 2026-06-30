# foxkit-bundle-templates

## 1.1.0

### Minor Changes

- 3d624f7: Add bundle price display and add-on checkbox interaction

  - Bundle price container now renders sale price, compare-at price, and a configurable discount label (e.g. "save 10%") driven by the active price strategy
  - Add-on products use a checkbox UI for selection/deselection; checkboxes are pre-selected by default
  - Add-ons section is always visible when add-on products exist, regardless of strategy; `add_on_strategy` is passed to the product card to conditionally render the checkbox
  - Replaced `button_atc_text`, `button_add_to_bundle_text`, and `price_label` block settings with a single `discount_label` setting; removed `hide_category_title` and `wrapper_custom_classes` settings
  - Added quantity badge on product cards for quantities greater than 1
  - Fixed variant input name collisions when the same product appears in multiple categories
  - Added configurable swatch size setting (12–40px, default 20px)
  - Renamed border radius labels to "Images & panels" and "Buttons & inputs" for clarity
  - Added `border-radius` to the discount tag using the button radius variable
