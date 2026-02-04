// Foxsell Product Card
class FoxSellProductCard extends HTMLElement {
  constructor() {
    super();
    this.product = this.querySelector('foxsell-variant-radio') || this.querySelector('foxsell-variant-select');
    this.category = this.dataset.categoryTitle || '';
    this.disableAddToSet = false;
    this.foxsell = this.closest('foxsell-mix-match');
    this.boundAddToSet = this.addToSet.bind(this);
    this.boundRemoveFromSet = this.removeFromSet.bind(this);
    this.boundHandleSetItemUpdate = this.handleSetItemUpdate.bind(this);
    this.boundHandleCategoryValidated = this.handleCategoryValidated.bind(this);
  }

  connectedCallback() {
    this.querySelectorAll('.add-to-set').forEach(btn => btn.addEventListener('click', this.boundAddToSet));
    this.querySelectorAll('.remove-from-set').forEach(btn => btn.addEventListener('click', this.boundRemoveFromSet));
    if (this.foxsell) {
      this.setItemUpdateUnsubscribe = this.foxsell.subscribe(FOXSELL_EVENTS.setItemUpdated, this.boundHandleSetItemUpdate);
      this.categoryValidatedUnsubscribe = this.foxsell.subscribe(FOXSELL_EVENTS.categoryValidated, this.boundHandleCategoryValidated);
    }
  }

  disconnectedCallback() {
    if (this.foxsell) {
      this.setItemUpdateUnsubscribe?.();
      this.categoryValidatedUnsubscribe?.();
    }
    this.querySelectorAll('.add-to-set').forEach(btn => btn.removeEventListener('click', this.boundAddToSet));
    this.querySelectorAll('.remove-from-set').forEach(btn => btn.removeEventListener('click', this.boundRemoveFromSet));
  }

  handleSetItemUpdate(event) {
    if (event.category?.title !== this.category) return;
    if (event.item.id === this.product?.currentVariant?.id) this.updateQuantity(event.item.quantity);
  }

  handleCategoryValidated(event) {
    if (event.category?.title !== this.category) return;
    this.disableAddToSet = event.isValid;
    this.toggleAddToSetButton(event.isValid);
  }

  toggleAddToSetButton(disable) {
    const btn = this.querySelector('.add-to-set');
    if (!btn) return;
    btn.toggleAttribute('disabled', disable || this.disableAddToSet);
    this.updateQuantity(this.getCurrentQuantity());
  }

  getCurrentQuantity() {
    const items = this.foxsell?.selectedProducts?.[this.category]?.items;
    return items?.find(item => item.id === this.product?.currentVariant?.id)?.quantity ?? 0;
  }

  updateQuantity(quantity) {
    const el = this.querySelector('.quantity');
    if (el) el.textContent = quantity;
  }

  removeFromSet() {
    const variant = this.product?.currentVariant;
    if (!variant || !this.foxsell) return;
    this.foxsell.publish(FOXSELL_EVENTS.removeFromSet, { category: this.category, quantity: 1, variant });
  }

  addToSet() {
    const variant = this.product?.currentVariant;
    if (!variant || !this.foxsell) return;
    this.foxsell.publish(FOXSELL_EVENTS.addToSet, { category: this.category, quantity: 1, variant });
  }
}
customElements.define('foxsell-product-card', FoxSellProductCard);

// Foxsell Product Options
class FoxSellVariantRadio extends HTMLElement {
  constructor() {
    super();
    this.productCard = null;
    this.boundOnVariantChange = this.onVariantChange.bind(this);
  }

  connectedCallback() {
    this.productCard = this.closest('foxsell-product-card');
    this.onVariantChange();
    this.addEventListener('change', this.boundOnVariantChange);
  }

  disconnectedCallback() {
    this.removeEventListener('change', this.boundOnVariantChange);
  }

  onVariantChange() {
    this.updateOptions();
    this.updateMasterId();
    this.updateOptionLabels();
    this.updateVariantStatuses();
    this.updatePrice();
    this.updateFeaturedImage();
    this.toggleAddToSetButton(false);
    if (!this.currentVariant) this.toggleAddToSetButton(true);
  }

  updateOptions() {
    this.options = [...this.querySelectorAll('fieldset')].map(fs =>
      fs.querySelector('input:checked')?.value
    );
  }

  getVariantData() {
    if (this.variantData) return this.variantData;
    try {
      const parsed = JSON.parse(this.querySelector('[type="application/json"]')?.textContent || '{}');
      const raw = Array.isArray(parsed.available_variants) ? parsed.available_variants : (Array.isArray(parsed) ? parsed : []);
      this.variantData = raw.map(v => ({ ...v, product: parsed.product ?? null }));
    } catch (e) {
      console.error('Failed to parse variant data:', e);
      this.variantData = [];
    }
    return this.variantData;
  }

  updateMasterId() {
    this.currentVariant = this.getVariantData().find(v =>
      v.options?.every((opt, i) => opt === this.options?.[i])
    );
  }

  updateOptionLabels() {
    this.querySelectorAll('fieldset').forEach((fieldset, i) => {
      const span = fieldset.querySelector('.foxsell-variant-radio__option-value, .foxsell-variant-select__option-value');
      if (span) span.textContent = this.options?.[i] ?? '';
    });
  }

  updateVariantStatuses() {
    const firstChecked = this.querySelector(':checked');
    if (!firstChecked) return;
    
    const selectedOptionOneVariants = this.variantData.filter(variant => firstChecked.value === variant.option1);
    const inputWrappers = [...this.querySelectorAll('fieldset')];
    
    inputWrappers.forEach((option, index) => {
      if (index === 0) return;
      
      const optionInputs = [...option.querySelectorAll('input[type="radio"], option')];
      const previousFieldset = inputWrappers[index - 1];
      const previousChecked = previousFieldset.querySelector(':checked');
      
      if (!previousChecked) return;
      
      const availableOptionInputsValue = selectedOptionOneVariants
        .filter(variant => variant.available && variant[`option${index}`] === previousChecked.value)
        .map(variantOption => variantOption[`option${index + 1}`]);
      
      this.setInputAvailability(optionInputs, availableOptionInputsValue);
    });
  }

  setInputAvailability(listOfOptions, listOfAvailableOptions) {
    listOfOptions.forEach(input => {
      input.disabled = !listOfAvailableOptions.includes(input.getAttribute('value'));
    });
  }

  updatePrice() {
    const priceEl = this.productCard?.querySelector('.foxsell-product-card__price');
    if (priceEl) priceEl.textContent = window.foxsell.formatMoney(this.currentVariant?.price);
  }

  updateFeaturedImage() {
    const img = this.productCard?.querySelector('.foxsell-product-card__image');
    const image = this.currentVariant?.featured_image || this.currentVariant?.product?.featured_image;
    if (!img || !image?.src) return;
    img.src = image.src;
    if (image.width != null) img.srcset = image.src + (image.src.includes('?') ? '&' : '?') + 'width=' + image.width;
  }

  toggleAddToSetButton(disable) {
    this.productCard?.toggleAddToSetButton(disable);
  }
}
customElements.define('foxsell-variant-radio', FoxSellVariantRadio);


class FoxSellVariantSelect extends FoxSellVariantRadio {
  constructor() {
    super();
  }

  updateOptions() {
    this.options = Array.from(this.querySelectorAll('select'), (select) => select.value);
  }
}
customElements.define('foxsell-variant-select', FoxSellVariantSelect);


// Foxsell Category
class FoxSellCategory extends HTMLElement {
  constructor() {
    super();
    this.categoryTitle = this.dataset.categoryTitle || '';
    this.foxsell = this.closest('foxsell-mix-match');
    this.categoryProducts = this.querySelector('.foxsell-category__products');
  }

  connectedCallback() {
    if(!this.foxsell || !this.categoryProducts) return;
    this.setItemUpdateUnsubscribe = this.foxsell.subscribe(FOXSELL_EVENTS.setItemUpdated, this.updateCategoryProducts.bind(this));
  }

  disconnectedCallback() {
    if(this.setItemUpdateUnsubscribe) this.setItemUpdateUnsubscribe();
  }

  updateCategoryProducts(event) {
    if (event.category?.title !== this.categoryTitle || !this.categoryProducts) return;
    this.categoryProducts.innerHTML = event.category.items.map(item =>
      `<div><div>${item.product?.title ?? ''}</div><div>${item.title ?? ''}</div><div>${item.quantity ?? 0}</div></div>`
    ).join('');
  }
}
customElements.define('foxsell-category', FoxSellCategory);