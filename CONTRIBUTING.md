# Contributing to FoxKit Bundle Templates

Thanks for your interest in contributing. This repository ships ready-to-use Shopify theme templates for FoxSell Bundles. Contributions that improve templates, docs, accessibility, or developer experience are welcome.

## Ways to contribute

- Fix bugs in Liquid, JavaScript, or CSS
- Improve Theme Editor settings and defaults
- Add or clarify template README documentation
- Improve accessibility, performance, or responsive behavior
- Propose a new template (open an issue first)

## Before you start

1. Check [existing issues](https://github.com/FoxSellApp/foxkit-bundle-templates/issues) and pull requests to avoid duplicate work.
2. For larger changes or a new template, open an issue first so maintainers can align on scope.
3. Read the root [README](./README.md) and the README inside the template folder you plan to change.

## Development setup

These templates are meant to be copied into an Online Store 2.0 Shopify theme.

1. Fork the repository and clone your fork.
2. Create a branch for your change.
3. Copy the template files into a development theme, or work against a local theme that already includes the template.
4. Use a development store with FoxSell Bundles configured so you can verify real bundle data.

### Repository layout

```text
templates/
  <template-name>/
    assets/
    blocks/      # only when the template uses app blocks
    sections/
    snippets/
    templates/   # optional product JSON templates
    README.md
```

Keep file paths aligned with Shopify theme directories. If you add or rename files, update the template README so installation steps stay accurate.

## Making changes

### Branching

Use a short, descriptive branch name, for example:

- `fix/glow-summary-quantity`
- `docs/shade-install-steps`
- `feature/skeleton-progress-message`

### Guidelines

- Prefer focused pull requests. One concern per PR is easier to review.
- Match the existing naming, structure, and coding style of the template you are editing.
- Prefer Theme Editor settings over hard-coded values when merchants should be able to customize behavior.
- Keep Liquid, JS, and CSS changes scoped to the template you are modifying unless a shared pattern is intentional.
- Update the template README when behavior, settings, or file mapping changes.
- Do not commit secrets, store credentials, or private theme tokens.

### New templates

If you want to add a new template:

1. Open an issue describing the use case, layout, and how it differs from existing templates.
2. Mirror the Shopify theme folder structure used by other templates.
3. Include a README with installation steps, required files, and configuration notes.
4. Use a unique template name so generated asset and Liquid filenames do not collide with existing templates.

## Testing

Before opening a pull request, verify your changes in a Shopify development theme:

- [ ] Template installs by copying files into the matching theme directories
- [ ] Section or block appears in the Theme Editor
- [ ] Bundle product selection and metafield-driven rendering still work when expected
- [ ] Add to cart / bundle selection flows work for the scenarios you changed
- [ ] Desktop and mobile layouts look correct
- [ ] Theme Editor settings behave as documented
- [ ] No obvious Liquid, console, or network errors on the product page

Include testing notes in the pull request, including the theme and store setup you used when relevant.

## Pull requests

1. Push your branch to your fork.
2. Open a pull request against `main`.
3. Fill in a clear summary:
   - What changed
   - Why it changed
   - How you tested it
4. Link related issues.
5. Keep the PR up to date if maintainers request changes.

## Reporting bugs

Open an issue and include:

- Template name (for example `glow`, `base`, `shade`)
- Steps to reproduce
- Expected vs actual behavior
- Theme name/version if known
- Screenshots or screen recordings when useful
- Browser and device details for UI bugs

## Feature requests

Open an issue describing:

- The problem or merchant/developer need
- Your proposed solution
- Alternatives you considered
- Which templates should be affected

## Code of conduct

Be respectful and constructive in issues, discussions, and pull requests. Assume good intent, keep feedback specific, and focus on improving the templates for merchants and developers.

## License

By contributing, you agree that your contributions will be licensed under the same license as this repository.
