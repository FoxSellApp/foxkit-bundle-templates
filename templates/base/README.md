# FoxKit: Bundle Templates Development Environment

A Rollup-based build system for building FoxSell bundle templates. FoxKit provides a **Mix & Match** bundle builder for Shopify themes, using Web Components (custom elements) and Liquid templates.

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
foxkit.config.js       # Template name and entrypoint
```

## Installation

Clone the repository and run:

```bash
npm install
```

`npm run setup` runs automatically after install (`postinstall`). Run it manually to reinitialize the theme (e.g., after deleting the theme directory). Use `npm run reset` to clean everything and reinitialize from scratch.

### Configuration

1. Update the `shopify.theme.toml` file with your Shopify store information.
2. Update the `foxkit.config.js` file with your template name (e.g. `"Skeleton"`, `"MyTheme"`).

   | Option       | Description                                      |
   | ------------ | ------------------------------------------------ |
   | `name`       | Template name — used for asset filenames and output |
   | `entrypoint` | JS entry file (default: `./src/entries/index.js`) |

   **Asset naming**: The template name is converted to kebab-case for filenames. For example:
   - `"Skeleton"` → `foxsell-skeleton.js`, `foxsell-skeleton.css`
   - `"MyTheme"` → `foxsell-my-theme.js`, `foxsell-my-theme.css`

> **Note**: Use a unique name for your template to **avoid conflicts with other templates**. The build automatically appends the template name to Liquid snippets/sections and asset references — no manual renaming needed.

### Build pipeline (`build-utils.js`)

The build automatically:

- **Renames output files**: `mix-match.liquid` → `foxsell-skeleton-mix-match.liquid` (and similarly for sections)
- **Updates `{% render %}` references**: `{% render 'mix-match' %}` → `{% render 'foxsell-skeleton-mix-match' %}`
- **Updates asset refs**: Source uses placeholders `foxsell.css` and `foxsell.js`; the build outputs `foxsell-skeleton.css` and `foxsell-skeleton.js`

Edit source files with short names (e.g. `mix-match.liquid`, `product-card.liquid`). The build applies the template prefix from `foxkit.config.js`.

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
FOXKIT_DRY_RUN=true npm run build
```

**Output example:**
```
[foxkit] Dry-run mode enabled — will preview deletions without removing files
[foxkit][dry-run] would remove stale: theme/snippets/foxsell-skeleton-old-snippet.liquid
[foxkit][dry-run] would remove stale template: theme/templates/product.foxsell-skeleton.liquid
```

Dry-run mode also adds error handling to file operations, logging failures instead of crashing the build.
