# FoxKit Bundle Templates

Ready-to-use Shopify theme templates for FoxSell Bundles. Each template folder contains the Liquid, JavaScript, CSS, and optional product template JSON needed to render a bundle experience in an Online Store 2.0 theme.

## Templates

| Template | Best for | Theme files | README |
| --- | --- | --- | --- |
| Base | A flexible all-at-once bundle grid with product options and a sticky summary. | assets, blocks, sections, snippets, templates | [View README](./templates/base/README.md) |
| Glow | A two-step bundle builder with category navigation, add-ons, and a sticky summary. | assets, blocks, sections, snippets, templates | [View README](./templates/glow/README.md) |
| Reserve | A compact block with accordion categories and inline pricing. | assets, blocks, snippets | [View README](./templates/reserve/README.md) |
| Shade | A product-page block that works with the theme's native add-to-cart form. | assets, blocks, sections, snippets | [View README](./templates/shade/README.md) |
| Skeleton | A minimal starting point for a custom bundle grid and summary. | assets, blocks, sections, snippets, templates | [View README](./templates/skeleton/README.md) |
| Step | A guided category-by-category builder with quantity rules and step progress. | assets, blocks, sections, snippets, templates | [View README](./templates/step/README.md) |

## Repository Structure

```text
templates/
  base/
  glow/
  reserve/
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

- Templates read FoxSell bundle data from the selected bundle product and only render when that configuration exists.
- Every template includes a Shopify theme block for placement through the Theme Editor.
- Base, Glow, Skeleton, and Step also include a product JSON template that can be assigned directly to a Shopify product.
- Reserve and Shade are intended for block placement and do not include a product JSON template.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, guidelines, testing expectations, and pull request instructions.

## License

This project is licensed under the [MIT License](./LICENSE).
