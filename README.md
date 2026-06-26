# FoxKit Bundle Templates

Ready-to-use Shopify theme templates for FoxSell Bundles. Each template folder contains the Liquid, JavaScript, CSS, and optional product template JSON needed to render a bundle experience in an Online Store 2.0 theme.

## Templates

| Template | Best for | Theme files | README |
| --- | --- | --- | --- |
| Base | General dynamic add-ons bundles with a flexible product grid and summary. | assets, sections, snippets, templates | [View README](./templates/base/README.md) |
| Skeleton | A minimal starter template for building a custom bundle layout. | assets, sections, snippets, templates | [View README](./templates/skeleton/README.md) |
| Step | Guided bundle building with quantity rules and step-style progress messaging. | assets, sections, snippets, templates | [View README](./templates/step/README.md) |
| Shade | App block based bundle placement for themes that support product page app blocks. | assets, blocks, sections, snippets | [View README](./templates/shade/README.md) |
| Glow | A polished dynamic add-ons bundle layout with configurable styling and progress messaging. | assets, sections, snippets, templates | [View README](./templates/glow/README.md) |
| Mix Match Fixed Template | Fixed-price bundles with one product per category and variant selection. | assets, sections, snippets | [View README](./templates/mix-match-fixed-template/README.md) |
| Mix Match Combined Listing Template | Fixed-price bundles where multiple products in a category are shown as one combined listing. | assets, sections, snippets | [View README](./templates/mix-match-combined-listing-template/README.md) |

## Repository Structure

```text
templates/
  base/
  glow/
  mix-match-combined-listing-template/
  mix-match-fixed-template/
  shade/
  skeleton/
  step/
```

Each template mirrors Shopify theme directories:

| Directory | Shopify theme destination | Purpose |
| --- | --- | --- |
| `assets/` | `assets/` | Template JavaScript, CSS, and supporting images. |
| `blocks/` | `blocks/` | Theme app block Liquid files. Only templates that use blocks include this directory. |
| `sections/` | `sections/` | Bundle sections and product modal sections. |
| `snippets/` | `snippets/` | Rendered bundle components such as product cards, options, summaries, and overrides. |
| `templates/` | `templates/` | Optional product JSON templates that place the bundle section on a product page. |

## Installation

1. Choose a template from the `templates/` directory.
2. Copy each file into the matching directory in the Shopify theme.
3. If the template includes a `templates/product.*.json` file, copy it into the theme `templates/` directory and assign it to the bundle product in Shopify admin.
4. Add the template section or block in the Shopify Theme Editor.
5. Select the FoxSell bundle product in the section or block settings when the template exposes a bundle product picker.
6. Configure colors, spacing, product card settings, button text, and progress messages from the Theme Editor.

## Notes

- The newer templates read FoxSell dynamic add-ons bundle data from the bundle product metafield and only render when that configuration exists.
- Templates with `product.foxsell-*.json` files can be assigned directly to a Shopify product.
- `shade` is an app block template and is intended for block placement instead of a product JSON template.
- The legacy fixed and combined listing templates are fixed-pricing examples and have a smaller configuration surface.

## Contributing

1. Create a branch for your change.
2. Update the template files and README together.
3. Verify the file mapping still matches Shopify theme directories.
4. Open a pull request with a summary and testing notes.
