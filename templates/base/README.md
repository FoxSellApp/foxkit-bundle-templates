# FoxSell: Bundle Templates Development Environment

A Rollup-based build system for building FoxSell bundle templates. FoxSell is a **Mix & Match** bundle builder for Shopify themes, using Web Components (custom elements) and Liquid templates.

## Project Structure

```
src/
├── entries/           # JS & CSS entry points
│   ├── index.js       # Central entry — registers all custom elements, imports CSS
│   ├── js/            # Component logic (mix-match, product card, bundle summary, etc.)
│   └── css/           # Component styles
├── snippets/          # Liquid templates (Shopify)
│   ├── mix-match.liquid
│   ├── product-card.liquid
│   ├── bundle-summary.liquid
│   ├── product-options.liquid
│   ├── product-modal.liquid
│   └── css-variables.liquid
├── sections/          # Liquid sections
│   ├── mix-match.liquid
│   └── product-modal.liquid
├── blocks/            # Liquid blocks (use default-block.liquid as placeholder)
├── templates/         # Liquid templates (use default-template naming convention)
└── assets/            # Build output (auto-generated — do not edit)
build-utils.js         # Liquid rename/transform — appends template name at build time
foxsell.config.js       # Template name and entrypoint
```

## Installation

Clone the repository and run:

```bash
npm install
```

`npm run setup` runs automatically after install (`postinstall`). Run it manually to reinitialize the theme (e.g., after deleting the theme directory). Use `npm run reset` to clean everything and reinitialize from scratch.

### Configuration

1. Update the `shopify.theme.toml` file with your Shopify store information.
2. Update the `foxsell.config.js` file with your template name (e.g. `"Skeleton"`, `"MyTheme"`).

   | Option                | Description                                      |
   | --------------------- | ------------------------------------------------ |
   | `name`                | Template name — used for asset filenames and output |
   | `entrypoint`          | JS entry file (default: `./src/entries/index.js`) |
   | `overwriteTemplates`  | When `true` (default), copy `src/templates/` into `theme/` and `dist/`. Set to `false` to leave existing template files untouched. |

   **Asset naming**: The template name is converted to kebab-case for filenames. For example:
   - `"Skeleton"` → `foxsell-skeleton.js`, `foxsell-skeleton.css`
   - `"MyTheme"` → `foxsell-my-theme.js`, `foxsell-my-theme.css`

> **Note**: Use a unique name for your template to **avoid conflicts with other templates**. The build automatically appends the template name to Liquid snippets/sections and asset references — no manual renaming needed.

### Build pipeline (`build-utils.js`)

The build automatically:

- **Renames output files**: `mix-match.liquid` → `foxsell-skeleton-mix-match.liquid` (and similarly for sections)
- **Updates `{% render %}` references**: `{% render 'mix-match' %}` → `{% render 'foxsell-skeleton-mix-match' %}`
- **Updates asset refs**: Source uses placeholders `foxsell.css` and `foxsell.js`; the build outputs `foxsell-skeleton.css` and `foxsell-skeleton.js`

Edit source files with short names (e.g. `mix-match.liquid`, `product-card.liquid`). The build applies the template prefix from `foxsell.config.js`.

#### Blocks (`src/blocks/`)

Blocks use a different convention from snippets and sections. Snippets and sections always have `foxsell-{template-name}-` prepended to their filenames. Blocks use `default-block.liquid` as an exact placeholder filename that gets replaced with `foxsell-{template-name}.liquid`; all other block files fall back to the prefix approach.

| Source | Output |
| --- | --- |
| `default-block.liquid` | `foxsell-skeleton.liquid` |
| `mix-match.liquid` | `foxsell-skeleton-mix-match.liquid` (fallback — prefix added) |

#### Templates (`src/templates/`)

Template source files use `default-template` as a placeholder, which the build replaces with `foxsell-{template-name}`:

| Source | Output |
| --- | --- |
| `product.default-template.json` | `product.foxsell-skeleton.json` |

Set `overwriteTemplates: false` in `foxsell.config.js` to skip copying these outputs — useful when you customize template JSON in `theme/templates/` (or keep published templates) and do not want rebuilds to overwrite them.

### Available Placeholders

Use these placeholders in Liquid source files (snippets, sections, blocks, templates) — `build-utils.js` replaces them at build time with values derived from `foxsell.config.js`'s `name`.

| Placeholder | Replaced with (example: `name: "Skeleton"`) | Typical use |
| --- | --- | --- |
| `<<foxsell-template-name>>` | `FoxSell Skeleton` | `{% schema %}` `"name"` / preset `"name"` fields |
| `<<foxsell-template-slug>>` | `foxsell-skeleton` | Any other slug-style reference in Liquid content |
| `<<foxsell-template-handle>>` | `skeleton` | Raw kebab-case handle, unprefixed |
| `<<foxsell-default-block-slug>>` | `foxsell-skeleton` | `{% schema %}` block `"type"` referencing the renamed `default-block.liquid` (e.g. in a section's preset `"blocks"`) |
| `foxsell.css` / `foxsell.js` | `foxsell-skeleton.css` / `foxsell-skeleton.js` | Liquid asset tag references (`{{ 'foxsell.css' \| asset_url }}`, etc.) |
| `default-block.liquid` (filename) | `foxsell-skeleton.liquid` | Block **filenames** in `src/blocks/` (see [Blocks](#blocks-srcblocks)) |
| `default-template` (filename segment) | `foxsell-skeleton` | Template **filenames** in `src/templates/` (see [Templates](#templates-srctemplates)) |

> `{% render 'name' %}` references don't use a placeholder — any short snippet name is automatically prefixed to `foxsell-{template-name}-name` by the build.

### Available Formatters (`build-utils.js`)

Helper functions that implement the renaming/transform logic described above. Useful if you need to customize the build (e.g. in `rollup.config.js` / `rollup.dist.js`).

| Function | Purpose |
| --- | --- |
| `toKebabCase(name)` | Converts a PascalCase/camelCase name (e.g. `MixMatch`) to kebab-case (e.g. `mix-match`) |
| `createBlockRename(kebabCaseName)` | Returns a `(name, extension) => string` renamer for block files: `default-block` → `foxsell-{kebabCaseName}`, all other block files → `foxsell-{kebabCaseName}-{name}` |
| `createTemplateRename(kebabCaseName)` | Returns a `(name, extension) => string` renamer for template files: `default-template` → `foxsell-{kebabCaseName}` |
| `createLiquidRename(kebabCaseName)` | Returns a `(name, extension) => string` renamer for snippet/section files: prefixes `foxsell-{kebabCaseName}-` |
| `createLiquidTransform(kebabCaseName, name)` | Returns a `(contents, filename) => string` content transform: replaces placeholder tokens, rewrites `{% render %}` references, and updates `foxsell.css`/`foxsell.js` asset refs |
| `createTemplateTokenTransform(kebabCaseName, name)` | Returns a `(contents, filename) => string` content transform for non-Liquid text assets (e.g. compiled JS/CSS) — replaces only the placeholder tokens |
| `removeStaleLiquidOutputs(...)` | Deletes previously-generated Liquid output files whose source no longer exists |
| `staleLiquidOutputsThemePlugin(...)` / `staleLiquidOutputsDistPlugin(...)` | Rollup plugins wrapping `removeStaleLiquidOutputs` for `theme/` and `dist/<template>/` respectively |

## Additional settings

Base supports per-product **additional settings** from metafields. They are merged with defaults via `resolveAdditionalSettings()` and exposed on the JS config as `additionalSettings`.

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
| `add_on_settings.strategy` | `"add_on_step"` shows the add-ons category UI; `"automatic_add"` hides that UI and adds add-ons automatically |

Partial or missing metafield values are filled from the defaults above.

## Development

Start the development server for the Shopify theme and the bundle templates:

```bash
npm start
# or
npm run dev
```

> **Note**: If you are experiencing issues with the development server, try restarting by running `npm run dev` again.

## Building

When you are ready to build the bundle templates:

```bash
npm run build
```

This automatically cleans the `dist` directory before building, then places the bundle templates in `dist/<template-name>/` (e.g. `dist/skeleton/`).

### Other Available Commands

```bash
# Starts the development server (alias for npm run dev)
npm start

# Starts the development server for the Shopify theme
npm run dev:shopify

# Starts the development server for the bundle templates
npm run dev:bundle

# Preview file deletions without removing (dry-run mode)
npm run dev:dry-run
npm run build:dry-run

# Initialize the theme folder (also runs automatically on npm install)
npm run setup

# Clean everything and reinitialize the theme from scratch
npm run reset

# Cleans dist, theme, and generated assets
npm run clean

# Cleans only the dist directory
npm run clean:dist

# Cleans only the Shopify theme
npm run clean:theme

# Cleans only generated assets (src/assets/foxsell-*.js, foxsell-*.css)
npm run clean:assets
```

### Dry-Run Mode

Dry-run mode allows you to preview which files would be deleted during the build process without actually removing them. This is useful for:

- **Debugging**: Understanding what the build system considers "stale"
- **Safety**: Verifying deletions before committing changes
- **Learning**: Seeing how the rename/transform logic works

**Usage:**

```bash
# Preview deletions during development
npm run dev:dry-run

# Preview deletions during production build
npm run build:dry-run

# Or set the environment variable directly
FOXSELL_DRY_RUN=true npm run build
```

**Output example:**
```
[foxsell] Dry-run mode enabled — will preview deletions without removing files
[foxsell][dry-run] would remove stale: theme/snippets/foxsell-skeleton-old-snippet.liquid
[foxsell][dry-run] would remove stale template: theme/templates/product.foxsell-skeleton.liquid
```

Dry-run mode also adds error handling to file operations, logging failures instead of crashing the build.
