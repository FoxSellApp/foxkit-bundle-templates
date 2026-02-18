'use strict';

const FOXSELL_EVENTS = {
  bundleUpdated: 'foxsell:bundle-updated',
};

// @ts-check

class FoxsellMixMatch extends HTMLElement {
  constructor() {
    super();
    this.selectedItems = new Map();
    this.config = {};

    try {
      const configElement = this.querySelector('#foxsell-config[type="application/json"]');
      this.config = configElement ? JSON.parse(configElement.textContent || '{}') : {};
    } catch (error) {
      console.error('Failed to parse foxsell config:', error);
      this.config = {};
    }
  }

  connectedCallback() {
    // Validate the bundle and set the initial state
    this.validateBundle();
  }

  getCategoryConfig(categoryId) {
    return this.config.categories?.find((category) => category.id === categoryId);
  }

  getCategory(categoryId, createIfNotExists = false) {
    const categoryConfig = this.getCategoryConfig(categoryId);
    if (!categoryConfig) return null;

    const category = this.selectedItems.get(categoryId);
    if (!category && createIfNotExists) {
      this.selectedItems.set(categoryId, {
        items: new Map(),
        quantity: 0,
        id: categoryId,
        title: categoryConfig.title,
        price: this.config.settings.price,
        isMaxQuantity: false,
        maxQuantity: categoryConfig.quantity,
      });
      return this.selectedItems.get(categoryId);
    }
    return category;
  }

  getSerializedCategory(categoryId) {
    const selectedCategory = this.getCategory(categoryId);
    if (!selectedCategory) return null;

    return {
      ...selectedCategory,
      items: Array.from(selectedCategory.items.values())
    }
  }

  getItem(itemId, categoryId) {
    const selectedCategory = this.getCategory(categoryId);
    if (!selectedCategory) return null;

    return selectedCategory.items.get(itemId);
  }

  getSelectedItems() {
    // serialize the selected items
    return Array.from(this.selectedItems.values()).map(category => ({
      id: category.id,
      title: category.title,
      quantity: category.quantity,
      maxQuantity: category.maxQuantity,
      isMaxQuantity: category.isMaxQuantity,
      price: category.price,
      items: Array.from(category.items.values())
    }));
  }

  addToBundle(item, quantity, categoryId) {
    const selectedCategory = this.getCategory(categoryId, true);
    if (!selectedCategory) return;

    const qoaEnabled = this.config.options?.length > 0;
    if (((selectedCategory.quantity + quantity) > selectedCategory.maxQuantity) && !qoaEnabled) return;

    const selectedItem = this.getItem(item.id, categoryId);
    if (!selectedItem) {
      selectedCategory.items.set(item.id, {
        quantity: quantity,
        ...item
      });
    } else {
      selectedItem.quantity += quantity;
    }
    selectedCategory.quantity += quantity;

    this.validateBundle();

    this.dispatchEvent(new CustomEvent(FOXSELL_EVENTS.bundleUpdated, {
      detail: {
        bundle: this.getSelectedItems(),
        action: 'add',
        item: this.getItem(item.id, categoryId),
        category: this.getSerializedCategory(categoryId),
      }
    }));
  }

  removeFromBundle(item, quantity, categoryId) {
    const selectedCategory = this.getCategory(categoryId);
    if (!selectedCategory) return;

    const selectedItem = this.getItem(item.id, categoryId);
    if (!selectedItem) return;

    const newItemQuantity = Math.max(selectedItem.quantity - quantity, 0);
    if (newItemQuantity === 0) {
      selectedCategory.items.delete(item.id);
    } else {
      selectedItem.quantity = newItemQuantity;
    }

    selectedCategory.quantity = Math.max(selectedCategory.quantity - quantity, 0);
    if (selectedCategory.quantity <= 0) {
      this.selectedItems.delete(categoryId);
    }

    this.validateBundle();

    this.dispatchEvent(new CustomEvent(FOXSELL_EVENTS.bundleUpdated, {
      detail: {
        bundle: this.getSelectedItems(),
        action: 'remove',
        item: { ...selectedItem, quantity: newItemQuantity },
        category: {
          ...selectedCategory,
          isMaxQuantity: this.getCategory(categoryId)?.isMaxQuantity || false,
          items: this.getSerializedCategory(categoryId)?.items || []
        }
      }
    }));
  }

  clearBundle() {
    this.selectedItems.clear();
    this.validateBundle();
    this.dispatchEvent(new CustomEvent(FOXSELL_EVENTS.bundleUpdated, {
      detail: {
        bundle: [],
        action: 'clear'
      }
    }));
  }

  validateBundle() {
    if (!this.config) return;
    const qoaEnabled = this.config.options?.length > 0;
    const isValid = qoaEnabled ? this.validateBundleWithQOA() : this.validateBundleWithoutQOA();
    this.updateLineItemProperties();
    this.renderPrice();
    this.toggleAddToCartButton(!isValid);
  }

  validateBundleWithQOA() {
    if (!this.config || !this.config.options) {
      this.toggleAddToCartButton(true);
      return;
    }

    const optionLimits = (this.config.options || [])
      .map(opt => Number(opt.quantity ?? opt))
      .filter(n => !Number.isNaN(n));

    const maxQuantity = optionLimits.length ? Math.max(...optionLimits) : 0;
    optionLimits.length ? Math.min(...optionLimits) : 0;

    const items = this.getSelectedItems().flatMap(category =>
      Array.isArray(category.items) ? category.items : []
    );

    const itemsCount = items.reduce((sum, item) => sum + item.quantity, 0);

    const currentValidOption = this.config.options.findLast(opt => Number(opt.quantity ?? opt) <= itemsCount);
    this.config.settings.price = currentValidOption?.price ?? null;

    let isValid = false;

    {
      isValid = Array.isArray(this.config.options)
        && this.config.options.some(opt => Number(opt.quantity ?? opt) === itemsCount);
    }

    this.selectedItems.forEach(category => {
      category.isMaxQuantity = (itemsCount >= maxQuantity);
    });

    return isValid;
  }

  validateBundleWithoutQOA() {
    if (!this.config || !this.config.categories) {
      this.toggleAddToCartButton(true);
      return;
    }

    const isValid = this.config.categories.reduce((allValid, category) => {
      const selectedCategory = this.getCategory(category.id);
      if (!selectedCategory) return false;
      const atMax = selectedCategory.quantity >= selectedCategory.maxQuantity;
      selectedCategory.isMaxQuantity = atMax;
      return allValid && atMax;
    }, true);

    return isValid;
  }

  updateLineItemProperties() {
    const bundleIdInput = this.querySelector('input[name="properties[__foxsell:dynamic_add_on_bundle_id]"]');
    const itemInput = this.querySelector('input[name="properties[__foxsell:dynamic_add_on_bundle_items]"]');

    if (!itemInput || !bundleIdInput || !this.config.bundleId) return;

    // add a timestamp to the bundle id to get unique bundle ids
    const bundleId = this.config.bundleId + '_' + Date.now();
    bundleIdInput.setAttribute('value', bundleId);

    const lineItems = this.getSelectedItems().flatMap(category =>
      (category.items || []).map(item => ({
        variantId: Number(item.id) || item.id,
        quantity: item.quantity || 1,
        category: category.title,
        type: 'product',
        properties: item.properties || {}
      }))
    );

    itemInput.setAttribute('value', JSON.stringify(lineItems));
  }

  /**
   * Get the total price of the bundle
   * @returns {{ totalPrice: number, discountedTotalPrice: number }}
   */
  getTotalPrice() {
    if(!this.config) return { totalPrice: 0, discountedTotalPrice: 0 };

    const items = this.getSelectedItems().flatMap((category) =>
      (Array.isArray(category.items) ? category.items : []).map(item => ({
        ...item,
        category: {
          id: category.id,
          title: category.title,
          quantity: category.quantity,
          maxQuantity: category.maxQuantity
        }
      }))
    );

    const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    let discountedTotalPrice = 0;
    if (this.config.settings.price && this.config.settings.price.strategy === 'dynamic_pricing') {
      const discount = this.config.settings.price.value;
      discountedTotalPrice = totalPrice - (totalPrice * (discount / 100));
    }
    return { totalPrice, discountedTotalPrice };
  }

  renderPrice() {
    const addToCartButton = this.querySelector('button[type="submit"]');
    if (!addToCartButton) return;

    if (!this.initialAddToCartButtonHTML) {
      this.initialAddToCartButtonHTML = addToCartButton.innerHTML;
    }

    const { totalPrice, discountedTotalPrice } = this.getTotalPrice();
    if (totalPrice > 0 && discountedTotalPrice > 0) {
      addToCartButton.innerHTML = `${this.initialAddToCartButtonHTML} -
      <span class="foxsell-slashed-price">${window.foxsell.formatMoney(totalPrice)}</span> 
      <span>${window.foxsell.formatMoney(discountedTotalPrice)}</span>`;
    } else {
      addToCartButton.innerHTML = this.initialAddToCartButtonHTML;
    }
  }

  toggleAddToCartButton(disable) {
    const addToCartButton = this.querySelector('button[type="submit"]');
    if (!addToCartButton) return;
    addToCartButton.toggleAttribute('disabled', disable);
  }
}

customElements.define('foxsell-mix-match', FoxsellMixMatch);

// @ts-check

class FoxsellCategoryHeader extends HTMLElement {
  constructor() {
    super();
    this.categoryId = this.getAttribute('data-category-id');
    this.quantityElement = this.querySelector('.foxsell-category__quantity');
    this.foxsell = this.closest('foxsell-mix-match');
  }

  connectedCallback() {
    if (!this.foxsell) return;
    this._boundUpdateQuantity = this.updateQuantity.bind(this);
    this.foxsell.addEventListener(FOXSELL_EVENTS.bundleUpdated, this._boundUpdateQuantity);
  }

  disconnectedCallback() {
    if (!this.foxsell || !this._boundUpdateQuantity) return;
    this.foxsell.removeEventListener(FOXSELL_EVENTS.bundleUpdated, this._boundUpdateQuantity);
  }

  updateQuantity(event) {
    const { category } = event.detail;
    if (!category) return;
    if (category.id !== this.categoryId) return;
    if (!this.quantityElement) return;
    this.quantityElement.textContent = `${category.quantity}/${category.maxQuantity}`;
  }
}

customElements.define('foxsell-category-header', FoxsellCategoryHeader);

// @ts-check

class FoxSellProductCard extends HTMLElement {
  constructor() {
    super();
    this.foxsell = this.closest('foxsell-mix-match');
    this.product = this.querySelector('foxsell-variant-radio') || this.querySelector('foxsell-variant-select');
    this.disableAddToBundle = false;
    this.boundAddToBundle = this.addToBundle.bind(this);
    this.boundRemoveFromBundle = this.removeFromBundle.bind(this);
    this.categoryId = this.getAttribute('data-category') || null;
    this.productId = parseInt(this.getAttribute('data-product-id') || '0');
  }

  connectedCallback() {
    this.querySelectorAll('.add-to-bundle').forEach(btn => btn.addEventListener('click', this.boundAddToBundle));
    this.querySelectorAll('.remove-from-bundle').forEach(btn => btn.addEventListener('click', this.boundRemoveFromBundle));
    if(this.product) {
      this.addEventListener('variant-change', this.handleVariantChange.bind(this));
    }

    if(this.foxsell) {
      this.foxsell.addEventListener(FOXSELL_EVENTS.bundleUpdated, this.handleBundleUpdated.bind(this));
    }
  }

  disconnectedCallback() {
    this.querySelectorAll('.add-to-bundle').forEach(btn => btn.removeEventListener('click', this.boundAddToBundle));
    this.querySelectorAll('.remove-from-bundle').forEach(btn => btn.removeEventListener('click', this.boundRemoveFromBundle));
    if(this.product) {
      this.removeEventListener('variant-change', this.handleVariantChange.bind(this));
    }

    if(this.foxsell) {
      this.foxsell.removeEventListener(FOXSELL_EVENTS.bundleUpdated, this.handleBundleUpdated.bind(this));
    }
  }

  handleVariantChange() {
    this.updateFeaturedImage();
    this.updatePrice();
    this.updateQuantity(this.getCurrentQuantity());
    this.toggleAddToBundleButton(false);
    if (!this.product?.currentVariant) this.toggleAddToBundleButton(true);
  }

  handleBundleUpdated(event) {
    const { item, category, action } = event.detail;

    if(action === 'clear') {
      this.disableAddToBundle = false;
      this.toggleAddToBundleButton(false);
      this.updateQuantity(0);
      return;
    }

    const qoaEnabled = this.foxsell.config.options?.length > 0;
    const disableAddToBundle = category.isMaxQuantity;

    if (!qoaEnabled && this.categoryId !== category.id) return;

    this.disableAddToBundle = disableAddToBundle;
    this.toggleAddToBundleButton(disableAddToBundle);
    
    if(qoaEnabled) this.updatePrice();

    if (this.productId === item.product.id) {
      this.updateQuantity(this.getCurrentQuantity());
    }
  }

  getCurrentQuantity(){
    if(!this.product?.currentVariant || !this.foxsell) return 0;
    const category = this.foxsell.getSerializedCategory(this.categoryId);
    if(!category) return 0;
    return category.items.find(item=> item.id === this.product.currentVariant.id)?.quantity ?? 0
  }

  updateFeaturedImage() {
    if (!this.product || !this.product.currentVariant) return;
    const img = this.querySelector('.foxsell-product-card__image');
    const image = this.product.currentVariant?.featured_image || this.product.currentVariant?.product?.featured_image;
    if (!img || !image?.src) return;
    img.src = image.src;
    if (image.width != null) img.srcset = image.src + (image.src.includes('?') ? '&' : '?') + 'width=' + image.width;
  }

  updatePrice() {
    if (!this.product || !this.product.currentVariant || !this.foxsell) return;
    const priceEl = this.querySelector('.foxsell-product-card__price');
    let price = this.product.currentVariant.price;
    let discountedPrice = 0;
    if(this.foxsell.config.settings.price && this.foxsell.config.settings.price.strategy === 'dynamic_pricing') {
      const discount = this.foxsell.config.settings.price.value;
      discountedPrice = price - (price * (discount / 100));
    }    if (priceEl) {
      if(discountedPrice > 0) {
        priceEl.innerHTML = `
        <span class="foxsell-slashed-price">${window.foxsell.formatMoney(price)}</span> 
        <span>${window.foxsell.formatMoney(discountedPrice)}</span>`;
      } else {
        priceEl.innerHTML = `<span>${window.foxsell.formatMoney(price)}</span>`;
      }
    }
  }

  updateQuantity(quantity) {
    const el = this.querySelector('.quantity');
    if (el) el.textContent = quantity;
  }

  addToBundle() {
    if(!this.product || !this.product.currentVariant || !this.foxsell) return;
    this.foxsell.addToBundle(this.product.currentVariant, 1, this.categoryId);
  }

  removeFromBundle() {
    if(!this.product || !this.product.currentVariant || !this.foxsell) return;
    this.foxsell.removeFromBundle(this.product.currentVariant, 1, this.categoryId);
  }

  toggleAddToBundleButton(disable) {
    const addToBundleButton = this.querySelector('.js.add-to-bundle');
    if(!addToBundleButton) return;
    addToBundleButton.toggleAttribute('disabled', disable || this.disableAddToBundle);
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
    // Dispatch variant change event to the product card
    this.dispatchEvent(new CustomEvent('variant-change', { bubbles: true }));
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

class FoxSellBundleSummary extends HTMLElement {
  constructor() {
    super();
    this.foxsell = this.closest('foxsell-mix-match');
    this._onBundleUpdated = this.updateBundleSummary.bind(this);
  }

  connectedCallback() {
    if (this.foxsell) {
      this.foxsell.addEventListener(FOXSELL_EVENTS.bundleUpdated, this._onBundleUpdated);
    }
  }

  disconnectedCallback() {
    if (this.foxsell) {
      this.foxsell.removeEventListener(FOXSELL_EVENTS.bundleUpdated, this._onBundleUpdated);
    }
  }

  updateBundleSummary(event) {
    const { bundle } = event.detail;
    const bundleItemsContainer = this.querySelector('.foxsell-bundle-summary__items-list');
    if (!bundle || !bundleItemsContainer) return

    if (!this.emptyStateHTML) {
      this.emptyStateHTML = bundleItemsContainer.innerHTML;
    }

    const items = bundle.flatMap((category) =>
      (Array.isArray(category.items) ? category.items : []).map(item => ({
        ...item,
        category: {
          id: category.id,
          title: category.title,
          quantity: category.quantity,
          maxQuantity: category.maxQuantity
        }
      }))
    );

    if (!items || items.length === 0) {
      bundleItemsContainer.innerHTML = this.emptyStateHTML;
      return;
    }

    bundleItemsContainer.innerHTML = items.map(item => {
      return this.renderLineItem(item);
    }).join('');
  }

  // DO NOT MODIFY THIS METHOD, extend the class to override this method
  renderLineItem(item) {
    const itemImage = item['featured_image'] ? item['featured_image'].src : item.product['featured_image'].src;
    let itemPrice = item.price;
    let discountedPrice = 0;
    let discount = 0;
    if (this.foxsell.config.settings.price && this.foxsell.config.settings.price.strategy === 'dynamic_pricing') {
      discount = this.foxsell.config.settings.price.value;
      discountedPrice = item.price - (item.price * (discount / 100));
    }
    return (`
      <foxsell-bundle-line-item data-item-id="${item.id}" data-category-id="${item.category.id}" data-category-title="${item.category.title}" data-quantity="${item.quantity}" class="foxsell-bundle-summary__item">
        <div><img src="${itemImage}"/></div>
        <div>
          <div>${item.product.title}</div>
          ${item.option1 != 'Default Title' ? `<div>${item.options.join(", ")}</div>` : ''}
          <div>
            ${discountedPrice > 0 ? `
              <div>
                <span class="foxsell-slashed-price">${foxsell.formatMoney(itemPrice)}</span> 
                <span>(${discount}% off)</span>
              </div>
              <span>${foxsell.formatMoney(discountedPrice)} x ${item.quantity}</span>`
        : `<span>${foxsell.formatMoney(itemPrice)} x ${item.quantity}</span>`
      }
          </div>
        </div>
        <div>
          <button class="foxsell-bundle-summary__item-delete">Delete</button>
        </div>
      </foxsell-bundle-line-item>
    `)
  }
}
customElements.define("foxsell-bundle-summary", FoxSellBundleSummary);

class FoxSellBundleLineItem extends HTMLElement {
  constructor() {
    super();
    this.bundleSummary = this.closest('foxsell-bundle-summary');
    this.foxsell = this.bundleSummary ? this.bundleSummary.foxsell : null;
    this._onDelete = this.handleItemDelete.bind(this);
  }

  connectedCallback() {
    this.deleteButton = this.querySelector('button.foxsell-bundle-summary__item-delete');
    if (this.deleteButton) {
      this.deleteButton.addEventListener('click', this._onDelete);
    }
  }

  disconnectedCallback() {
    if (this.deleteButton) {
      this.deleteButton.removeEventListener('click', this._onDelete);
    }
  }

  handleItemDelete() {
    if (!this.foxsell) return;
    this.foxsell.removeFromBundle({ id: parseInt(this.dataset.itemId) }, parseInt(this.dataset.quantity), this.dataset.categoryId);
  }
}
customElements.define("foxsell-bundle-line-item", FoxSellBundleLineItem);

class FoxSellBundleProgress extends HTMLElement {
  constructor() {
    super();
    this.foxsell = this.closest('foxsell-mix-match');
    this._onBundleUpdated = this.updateBundleProgress.bind(this);
  }

  connectedCallback() {
    if (this.foxsell) {
      this.foxsell.addEventListener(FOXSELL_EVENTS.bundleUpdated, this._onBundleUpdated);
    }
  }

  disconnectedCallback() {
    if (this.foxsell) {
      this.foxsell.removeEventListener(FOXSELL_EVENTS.bundleUpdated, this._onBundleUpdated);
    }
  }

  updateBundleProgress(event) {
    const { bundle } = event.detail;
    console.log('updateBundleProgress', bundle);

    const optionLimits = (this.foxsell.config.options || [])
      .map(opt => Number(opt.quantity ?? opt))
      .filter(n => !Number.isNaN(n));

    const maxQuantity = optionLimits.length ? Math.max(...optionLimits) : 0;
    optionLimits.length ? Math.min(...optionLimits) : 0;

    const items = bundle.flatMap((category) =>
      (Array.isArray(category.items) ? category.items : []).map(item => ({
        ...item,
        category: {
          id: category.id,
          title: category.title,
          quantity: category.quantity,
          maxQuantity: category.maxQuantity
        }
      }))
    );

    this.innerHTML = `${items.length}/${maxQuantity}`;
  }
}
customElements.define("foxsell-bundle-progress", FoxSellBundleProgress);
