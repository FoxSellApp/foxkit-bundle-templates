import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { Liquid } from 'liquidjs';

for (const template of ['base', 'glow', 'shade', 'step', 'skeleton']) {
const templateRoot = new URL(`../templates/${template}/`, import.meta.url);
const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
const document = dom.window.document;
dom.window.customElements.define('foxsell-mix-match', class extends dom.window.HTMLElement {});
dom.window.eval(readFileSync(new URL(`assets/foxsell-${template}.js`, templateRoot), 'utf8'));
const templateTest = (name, callback) => test(`${template}: ${name}`, callback);

const engine = new Liquid();
engine.registerTag('doc', {
  parse(token, tokens) {
    while (tokens.length && tokens.shift().name !== 'enddoc') {}
  },
  render() { return ''; },
});
engine.registerTag('paginate', { parse() {}, render() { return ''; } });
engine.registerTag('endpaginate', { parse() {}, render() { return ''; } });
engine.registerFilter('json', value => JSON.stringify(value));
engine.registerFilter('color_brightness', () => 150);
engine.registerFilter('handleize', value => String(value).toLowerCase().replaceAll(' ', '-'));
// LiquidJS tokenizes multiline liquid comments differently from Shopify.
const source = readFileSync(new URL(`snippets/foxsell-${template}-product-options.liquid`, templateRoot), 'utf8')
  .replace(/^\s*comment\s*$[\s\S]*?^\s*endcomment\s*$/gm, '');
const variants = [
  { id: 1, options: ['Single', 'Red', 'Small'], available: true },
  { id: 2, options: ['Single', 'Blue', 'Large'], available: true },
  { id: 3, options: ['Duo', 'Green', 'Medium'], available: true },
  { id: 4, options: ['Multipack', 'Red', 'Small'], available: true },
  { id: 5, options: ['Sold out', 'Red', 'Small'], available: false },
].map(variant => ({ ...variant, option1: variant.options[0], option2: variant.options[1], option3: variant.options[2], inventory_quantity: 10, inventory_policy: 'deny' }));

async function render({ type = 'select', enabled = true, swatches = false, available = variants, allowed = { 1: 10, 2: 10, 3: 20, 5: 10 }, modal = false } = {}) {
  const product = {
    id: 100, title: 'Fixture', variants: available,
    options_with_values: ['Pack', 'Color', 'Size'].slice(0, available[0]?.options.length ?? 3).map((name, optionIndex) => ({
      name, position: optionIndex + 1,
      values: [...new Set(available.map(variant => variant.options[optionIndex]))],
    })),
  };
  const html = await engine.parseAndRender(source, {
    product, allowed_variants: allowed, type,
    section: { id: 'fixture', settings: { hide_unavailable_variants: modal ? false : enabled } },
    show_color_swatches: swatches, color_option_name: 'Color',
    manual_color_swatches: 'Red: #ff0000, Blue: #0000ff, Green: #00ff00',
  });
  const root = document.createElement('foxsell-mix-match');
  if (enabled !== undefined) root.dataset.hideUnavailableVariants = String(enabled);
  root.innerHTML = html;
  document.body.replaceChildren(root);
  return root.querySelector(`foxsell-variant-${type}`);
}

function choices(selector, index) {
  const fieldset = selector.querySelectorAll('fieldset')[index];
  return [...fieldset.querySelectorAll('option, input')]
    .filter(input => !input.closest('label')?.hidden)
    .map(input => input.value);
}

function choose(selector, index, value) {
  const fieldset = selector.querySelectorAll('fieldset')[index];
  const select = fieldset.querySelector('select');
  if (select) select.value = value;
  else fieldset.querySelectorAll('input').forEach(input => { input.checked = input.value === value; });
  fieldset.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}

for (const type of ['select', 'radio']) {
  templateTest(`${type}: excluded multipacks and sold-out values are absent from Liquid output`, async () => {
    const selector = await render({ type });
    assert.deepEqual(choices(selector, 0), ['Single', 'Duo']);
    assert.equal(selector.querySelector('[value="Multipack"]'), null);
    assert.equal(selector.querySelector('[value="Sold out"]'), null);
    assert.equal(selector.currentVariant.id, 1);
  });

  templateTest(`${type}: three-option dependencies recover selection and restore choices`, async () => {
    const selector = await render({ type });
    let emittedVariant;
    selector.addEventListener('variant-change', () => { emittedVariant = selector.currentVariant?.id; });
    choose(selector, 1, 'Blue');
    assert.deepEqual(choices(selector, 2), ['Large']);
    assert.equal(emittedVariant, 2);
    choose(selector, 0, 'Duo');
    assert.deepEqual(choices(selector, 1), ['Green']);
    assert.deepEqual(choices(selector, 2), ['Medium']);
    assert.equal(selector.currentVariant.id, 3);
    choose(selector, 0, 'Single');
    assert.deepEqual(choices(selector, 1), ['Red', 'Blue']);
    assert.equal(selector.currentVariant.id, 1);
    assert.equal(selector.querySelectorAll('legend span')[1].textContent, 'Red');
  });

  templateTest(`${type}: disabled setting preserves unavailable choices`, async () => {
    const selector = await render({ type, enabled: false });
    assert.deepEqual(choices(selector, 0), ['Single', 'Duo', 'Multipack', 'Sold out']);
    assert.equal(selector.querySelector('[hidden]'), null);
  });

  templateTest(`${type}: empty availability leaves no selectable variant`, async () => {
    const selector = await render({ type, allowed: {} });
    assert.deepEqual(choices(selector, 0), []);
    assert.equal(selector.currentVariant, undefined);
    assert.equal(selector.querySelector('input:checked, option:checked'), null);
  });

  templateTest(`${type}: modal uses the owning bundle setting, including first option`, async () => {
    const selector = await render({ type, modal: true });
    assert.deepEqual(choices(selector, 0), ['Single', 'Duo']);
    choose(selector, 0, 'Duo');
    assert.equal(selector.currentVariant.id, 3);
  });

  templateTest(`${type}: numeric and GID allowed IDs behave identically`, async () => {
    const selector = await render({ type, allowed: { 'gid://shopify/ProductVariant/2': 10 } });
    assert.deepEqual(choices(selector, 0), ['Single']);
    assert.equal(selector.currentVariant.id, 2);
  });
}

templateTest('mixed dropdown and color swatches filter and restore dependent choices', async () => {
  const selector = await render({ swatches: true });
  assert.ok(selector.querySelector('.fieldset--color-swatch input'));
  choose(selector, 0, 'Duo');
  assert.deepEqual(choices(selector, 1), ['Green']);
  choose(selector, 0, 'Single');
  assert.deepEqual(choices(selector, 1), ['Red', 'Blue']);
  assert.equal(selector.currentVariant.id, 1);
});

templateTest('continue-selling variant remains available with zero inventory', async () => {
  const selector = await render({ available: [{ ...variants[0], inventory_quantity: 0, inventory_policy: 'continue' }] });
  assert.equal(selector.currentVariant.id, 1);
});

templateTest('one-option product selects its only allowed variant', async () => {
  const available = variants.map(variant => ({ ...variant, options: [variant.option1] }));
  const selector = await render({ available, allowed: { 3: 20 } });
  assert.deepEqual(choices(selector, 0), ['Duo']);
  assert.equal(selector.currentVariant.id, 3);
});

templateTest('section and block settings are opt-in and propagated to the bundle', async () => {
  const { globSync } = await import('node:fs');
  for (const path of globSync(`templates/${template}/{sections,blocks}/*.liquid`)) {
    const content = readFileSync(path, 'utf8');
    if (!content.includes('"id": "product_card_options_type"')) continue;
    const schema = JSON.parse(content.split('{% schema %}')[1].split('{% endschema %}')[0]);
    assert.deepEqual(schema.settings.find(setting => setting.id === 'hide_unavailable_variants'), {
      type: 'checkbox', id: 'hide_unavailable_variants', label: 'Hide unavailable variants', default: false,
      info: 'Hide sold-out variants and variants excluded from this bundle in dropdown and radio selectors.',
    });
  }
  const mixMatch = readFileSync(new URL(`snippets/foxsell-${template}-mix-match.liquid`, templateRoot), 'utf8');
  assert.match(mixMatch, /data-hide-unavailable-variants="{{ section.settings.hide_unavailable_variants \| default: false }}"/);
});

}
