'use strict';

const FOXSELL_EVENTS = {
  bundleUpdated: 'foxsell:bundle-updated',
};

// @ts-check


class FoxSellMixMatch extends HTMLElement {
  constructor() {
    super();
    this.selectedItems = new Map();
    /** @type {FoxSellMixMatchConfig | null} */
    this.config = null;
    /** @type {FoxSellBundle} */
    this.bundle = this.getEmptyBundle();

    try {
      const configElement = this.querySelector('#foxsell-config[type="application/json"]');
      this.config = configElement ? JSON.parse(configElement.textContent || '{}') : null;
    } catch (error) {
      console.error('Failed to parse foxsell config:', error);
      this.config = null;
    }
  }

  /**
   * @returns {FoxSellBundle}
   */
  getEmptyBundle() {
    return {
      items: [],
      isValid: false,
      originalTotalPrice: 0,
      totalPrice: 0,
      totalDiscount: 0,
      id: '',
      qaoEnabled: false,
      priceStrategy: null,
    };
  }

  /**
   * @description Get the current price strategy without mutating config
   * @returns {FoxSellPriceConfig | null}
   */
  getCurrentPriceStrategy() {
    if (!this.config) return null;
    const qaoEnabled = (this.config.options?.length ?? 0) > 0;
    if (!qaoEnabled) return this.config.settings.price;

    const items = this.bundle.items.flatMap(category =>
      Array.isArray(category.items) ? category.items : []
    );
    const itemsCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const currentValidOption = this.config.options.findLast(opt => Number(opt.quantity ?? opt) <= itemsCount);
    return currentValidOption?.price ?? null;
  }

  /**
   * @description Build the bundle state from current selection
   * @param {boolean} isValid
   * @returns {FoxSellBundle}
   */
  buildBundle(isValid) {
    if (!this.config) return this.getEmptyBundle();

    const qaoEnabled = (this.config.options?.length ?? 0) > 0;
    const items = this.getSelectedItems();
    const { originalTotalPrice, totalPrice, totalDiscount } = this.getTotalPrice();
    const id = this.config.bundleId ? `${this.config.bundleId}_${Date.now()}` : '';
    const priceStrategy = this.getCurrentPriceStrategy();

    return {
      items,
      isValid,
      originalTotalPrice,
      totalPrice,
      totalDiscount,
      id,
      qaoEnabled,
      priceStrategy,
    };
  }

  connectedCallback() {
    this.validateBundle();
  }

  /**
   * @param {string} categoryId
   * @returns {FoxSellCategoryConfig | undefined}
   */
  getCategoryConfig(categoryId) {
    if (!this.config) return undefined;
    return this.config.categories?.find((category) => category.id === categoryId);
  }

  /**
   * @param {string} categoryId
   * @param {boolean} createIfNotExists
   * @returns {FoxSellCategory | undefined}
   */
  getCategory(categoryId, createIfNotExists = false) {
    const categoryConfig = this.getCategoryConfig(categoryId);
    if (!categoryConfig) return undefined;

    const category = this.selectedItems.get(categoryId);
    if (!category && createIfNotExists) {
      this.selectedItems.set(categoryId, {
        items: new Map(),
        quantity: 0,
        id: categoryId,
        title: categoryConfig.title,
        isMaxQuantity: false,
        maxQuantity: categoryConfig.quantity,
      });
      return this.selectedItems.get(categoryId);
    }
    return category;
  }

  /**
   * @description Get an item from a category
   * @param {number} itemId
   * @param {string} categoryId
   * @returns {FoxSellSelectedItem | undefined}
   */
  getItem(itemId, categoryId) {
    const selectedCategory = this.getCategory(categoryId);
    if (!selectedCategory) return undefined;

    return selectedCategory.items.get(itemId);
  }

  /**
   * @description Get the selected items
   * @returns {FoxSellSerializedCategory[]}
   */
  getSelectedItems() {
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

  /**
   * @description Add an item to a category
   * @param {FoxSellVariant} item
   * @param {number} quantity
   * @param {string} categoryId
   * @returns {void}
   */
  addToBundle(item, quantity, categoryId) {
    const selectedCategory = this.getCategory(categoryId, true);
    if (!selectedCategory || !this.config) return;

    const qaoEnabled = this.config.options.length > 0;
    if (((selectedCategory.quantity + quantity) > selectedCategory.maxQuantity) && !qaoEnabled) return;

    const selectedItem = this.getItem(item.id, categoryId);
    if (!selectedItem) {
      selectedCategory.items.set(item.id, {
        ...item,
        quantity: quantity,
      });
    } else {
      selectedItem.quantity += quantity;
    }
    selectedCategory.quantity += quantity;

    this.validateBundle();

    this.dispatchEvent(new CustomEvent(FOXSELL_EVENTS.bundleUpdated, {
      detail: {
        bundle: this.bundle,
        action: 'add',
        item: this.getItem(item.id, categoryId),
        category: this.bundle.items.find((c) => c.id === categoryId),
      }
    }));
  }

  /**
   * @description Remove an item from a category
   * @param {FoxSellVariant} item
   * @param {number} quantity
   * @param {string} categoryId
   * @returns {void}
   */
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
    const categoryForEvent = selectedCategory.quantity <= 0
      ? { ...selectedCategory, isMaxQuantity: false, items: Array.from(selectedCategory.items.values()) }
      : null;

    if (selectedCategory.quantity <= 0) {
      this.selectedItems.delete(categoryId);
    }

    this.validateBundle();

    const category = categoryForEvent ?? this.bundle.items.find((c) => c.id === categoryId);
    this.dispatchEvent(new CustomEvent(FOXSELL_EVENTS.bundleUpdated, {
      detail: {
        bundle: this.bundle,
        action: 'remove',
        item: { ...selectedItem, quantity: newItemQuantity },
        category,
      }
    }));
  }

  /**
   * @description Clear the bundle
   * @returns {void}
   */
  clearBundle() {
    this.selectedItems.clear();
    this.validateBundle();
    this.dispatchEvent(new CustomEvent(FOXSELL_EVENTS.bundleUpdated, {
      detail: {
        bundle: this.bundle,
        action: 'clear'
      }
    }));
  }

  /**
   * @description Validate the bundle
   * @returns {void}
   */
  validateBundle() {
    if (!this.config) return;
    const qaoEnabled = this.config.options?.length > 0;
    const isValid = qaoEnabled ? this.validateBundleWithQAO() : this.validateBundleWithoutQAO();
    this.bundle = this.buildBundle(isValid);
    this.updateLineItemProperties();
    this.renderPrice();
    this.toggleAddToCartButton(!this.bundle.isValid);
  }

  /**
   * @description Validate the bundle with QAO
   * @returns {boolean}
   */
  validateBundleWithQAO() {
    if (!this.config || !this.config.options) {
      this.toggleAddToCartButton(true);
      return false;
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

  /**
   * @description Validate the bundle without QAO
   * @returns {boolean}
   */
  validateBundleWithoutQAO() {
    if (!this.config || !this.config.categories) {
      this.toggleAddToCartButton(true);
      return false;
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

  /**
   * @description Update the line item properties
   * @returns {void}
   */
  updateLineItemProperties() {
    const bundleIdInput = this.querySelector('input[name="properties[__foxsell:dynamic_add_on_bundle_id]"]');
    const itemInput = this.querySelector('input[name="properties[__foxsell:dynamic_add_on_bundle_items]"]');
    const savingsInput = this.querySelector('input[name="properties[__foxsell:dynamic_add_on_bundle_savings]"]');

    if (!itemInput || !bundleIdInput || !this.config?.bundleId) return;

    bundleIdInput.setAttribute('value', this.bundle.id);

    const lineItems = this.bundle.items.flatMap(category =>
      (category.items || []).map(item => ({
        variantId: Number(item.id) || item.id,
        quantity: item.quantity || 1,
        category: category.title,
        type: 'product',
        properties: item.properties || {}
      }))
    );

    itemInput.setAttribute('value', JSON.stringify(lineItems));

    if (savingsInput) {
      const { totalDiscount, totalPrice } = this.bundle;
      if (totalDiscount > 0 && totalPrice > 0) {
        savingsInput.setAttribute('value', window.foxsell?.formatMoney?.(totalDiscount));
      } else {
        savingsInput.setAttribute('value', '');
      }
    }
  }


  /**
   * @description Get the total price of the bundle
   * @returns {{ originalTotalPrice: number, totalPrice: number, totalDiscount: number }}
   */
  getTotalPrice() {
    if(!this.config) return { originalTotalPrice: 0, totalPrice: 0, totalDiscount: 0 };

    const items = this.bundle.items.flatMap((category) =>
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

    const originalTotalPrice = items.reduce((sum, item) => sum + item.foxsell_price * item.quantity, 0);
    const priceStrategy = this.getCurrentPriceStrategy();
    let totalPrice = 0;
    if (priceStrategy && priceStrategy.strategy === 'dynamic_pricing') {
      const discount = priceStrategy.value;
      totalPrice = originalTotalPrice - (originalTotalPrice * (discount / 100));
    } else if (priceStrategy) {
      totalPrice = priceStrategy.value * 100;
    }

    const totalDiscount = originalTotalPrice - totalPrice;
    return { originalTotalPrice, totalPrice, totalDiscount };
  }


  /**
   * @description Render the price of the bundle
   * @returns {void}
   */
  renderPrice() {
    const addToCartButton = this.querySelector('button[type="submit"]');
    if (!addToCartButton) return;

    if (!this.initialAddToCartButtonHTML) {
      this.initialAddToCartButtonHTML = addToCartButton.innerHTML;
    }

    const { originalTotalPrice, totalPrice } = this.bundle;
    if (originalTotalPrice > 0 && totalPrice > 0 && (totalPrice !== originalTotalPrice)) {
      addToCartButton.innerHTML = `${this.initialAddToCartButtonHTML} -
      <span class="foxsell-slashed-price">${window.foxsell.formatMoney(originalTotalPrice)}</span> 
      <span>${window.foxsell.formatMoney(totalPrice)}</span>`;
    } else {
      addToCartButton.innerHTML = this.initialAddToCartButtonHTML;
    }
  }

  /**
   * @description Toggle the add to cart button disabled state
   * @param {boolean} disable
   * @returns {void}
   */
  toggleAddToCartButton(disable) {
    const addToCartButton = this.querySelector('button[type="submit"]');
    if (!addToCartButton) return;
    addToCartButton.toggleAttribute('disabled', disable);
  }
}

// @ts-check

class FoxSellCategoryHeader extends HTMLElement {
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

  /**
   * @description Update the category quantity
   * @param {CustomEvent} event
   * @returns {void}
   */
  updateQuantity(event) {
    const { category } = event.detail;
    if (!category) return;
    if (category.id !== this.categoryId) return;
    if (!this.quantityElement) return;
    this.quantityElement.textContent = `${category.quantity}/${category.maxQuantity}`;
  }
}

// @ts-check

class FoxSellProductCard extends HTMLElement {
  constructor() {
    super();
    /** @type {FoxSellMixMatch | null} */
    this.foxsell = this.closest('foxsell-mix-match');

    /** @type {FoxSellVariantRadio | FoxSellVariantSelect | null} */
    this.variantSelector = this.querySelector('foxsell-variant-radio') || this.querySelector('foxsell-variant-select');
    this.disableAddToBundle = false;
    this.boundAddToBundle = this.addToBundle.bind(this);
    this.boundRemoveFromBundle = this.removeFromBundle.bind(this);
    this.boundHandleVariantChange = this.handleVariantChange.bind(this);
    this.boundHandleBundleUpdated = this.handleBundleUpdated.bind(this);
    this.categoryId = this.getAttribute('data-category') || null;
    this.productId = parseInt(this.getAttribute('data-product-id') || '0');
  }

  connectedCallback() {
    this.querySelectorAll('.add-to-bundle').forEach(btn => btn.addEventListener('click', this.boundAddToBundle));
    this.querySelectorAll('.remove-from-bundle').forEach(btn => btn.addEventListener('click', this.boundRemoveFromBundle));
    if(this.variantSelector) {
      this.addEventListener('variant-change', this.boundHandleVariantChange);
    }

    if(this.foxsell) {
      this.foxsell.addEventListener(FOXSELL_EVENTS.bundleUpdated, this.boundHandleBundleUpdated);
    }
  }

  disconnectedCallback() {
    this.querySelectorAll('.add-to-bundle').forEach(btn => btn.removeEventListener('click', this.boundAddToBundle));
    this.querySelectorAll('.remove-from-bundle').forEach(btn => btn.removeEventListener('click', this.boundRemoveFromBundle));
    if(this.variantSelector) {
      this.removeEventListener('variant-change', this.boundHandleVariantChange);
    }

    if(this.foxsell) {
      this.foxsell.removeEventListener(FOXSELL_EVENTS.bundleUpdated, this.boundHandleBundleUpdated);
    }
  }

  handleVariantChange() {
    this.updateFeaturedImage();
    this.updatePrice();
    this.updateQuantity(this.getCurrentQuantity());
    this.toggleAddToBundleButton(false);
    if (!this.variantSelector?.currentVariant) this.toggleAddToBundleButton(true);
  }

  /**
   * @description Handle the bundle updated event
   * @param {FoxSellCustomEvent} event
   * @returns {void}
   */
  handleBundleUpdated(event) {
    if(event.detail.action === 'clear') {
      this.disableAddToBundle = false;
      this.toggleAddToBundleButton(false);
      this.updateQuantity(0);
      return;
    }

    const { category, item } = event.detail;

    if (!this.foxsell || !this.foxsell.config) return;
    const qaoEnabled = this.foxsell.config.options.length > 0;
    const disableAddToBundle = category.isMaxQuantity;

    if (!qaoEnabled && this.categoryId !== category.id) return;

    this.disableAddToBundle = disableAddToBundle;
    this.toggleAddToBundleButton(disableAddToBundle);
    
    if(qaoEnabled) this.updatePrice();

    if (this.productId === item.product.id) {
      this.updateQuantity(this.getCurrentQuantity());
    }
  }

  /**
   * @description Get the current quantity
   * @returns {number}
   */
  getCurrentQuantity() {
    const variantId = this.variantSelector?.currentVariant?.id;
    if (variantId === undefined || variantId === null || !this.foxsell?.bundle || !this.categoryId) return 0;
    const category = this.foxsell.bundle.items.find((c) => c.id === this.categoryId);
    if (!category) return 0;
    return category.items.find((item) => item.id === variantId)?.quantity ?? 0;
  }

  /**
   * @description Update the featured image
   * @returns {void}
   */
  updateFeaturedImage() {
    if (!this.variantSelector || !this.variantSelector.currentVariant) return;
    const img = this.querySelector('.foxsell-product-card__image');
    const image = this.variantSelector.currentVariant?.featured_image || this.variantSelector.currentVariant?.product?.featured_image;
    if (!img || !image?.src) return;
    img.setAttribute('src', image.src);
    if (image.width != null) img.setAttribute('srcset', image.src + (image.src.includes('?') ? '&' : '?') + 'width=' + image.width);
  }

  /**
   * @description Update the price
   * @returns {void}
   */
  updatePrice() {
    if (!this.variantSelector || !this.foxsell || !this.foxsell.bundle) return;
    const priceEl = this.querySelector('.foxsell-product-card__price');
    if (!priceEl) return;
    
    // Use currentVariant price if available, otherwise fallback to product.price
    let price = this.variantSelector?.currentVariant?.price || this.variantSelector?.currentVariant?.product?.price || 0;
    
    let discountedPrice = 0;
    const priceStrategy = this.foxsell.bundle.priceStrategy;
    if (priceStrategy && priceStrategy.strategy === 'dynamic_pricing') {
      const discount = priceStrategy.value;
      discountedPrice = price - (price * (discount / 100));
    }
    
    if(discountedPrice > 0) {
      priceEl.innerHTML = `
      <span class="foxsell-slashed-price">${window.foxsell.formatMoney(price)}</span> 
      <span>${window.foxsell.formatMoney(discountedPrice)}</span>`;
    } else {
      priceEl.innerHTML = `<span>${window.foxsell.formatMoney(price)}</span>`;
    }
  }

  /**
   * @description Update the quantity
   * @param {number} quantity
   * @returns {void}
   */
  updateQuantity(quantity) {
    const el = this.querySelector('.quantity');
    if (el) el.textContent = String(quantity);
  }

  /**
   * @description Add item to bundle
   * @returns {void}
   */
  addToBundle() {
    if(!this.variantSelector || !this.variantSelector.currentVariant || !this.foxsell || !this.categoryId) return;
    this.foxsell.addToBundle(this.variantSelector.currentVariant, 1, this.categoryId);
  }

  /**
   * @description Remove item from bundle
   * @returns {void}
   */
  removeFromBundle() {
    if(!this.variantSelector || !this.variantSelector.currentVariant || !this.foxsell || !this.categoryId) return;
    this.foxsell.removeFromBundle(this.variantSelector.currentVariant, 1, this.categoryId);
  }

  /**
   * @description Toggle the add to bundle button
   * @param {boolean} disable
   * @returns {void}
   */
  toggleAddToBundleButton(disable) {
    const addToBundleButton = this.querySelector('.js.add-to-bundle');
    if(!addToBundleButton) return;
    addToBundleButton.toggleAttribute('disabled', disable || this.disableAddToBundle);
  }
}

// Foxsell Product Options
class FoxSellVariantRadio extends HTMLElement {
  constructor() {
    super();
    /** @type {FoxSellProductCard | null} */
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
      fs.querySelector('input:checked')?.getAttribute('value') ?? ''
    );
  }

  /**
   * @description Get the variant data
   * @returns {FoxSellVariant[]}
   */
  getVariantData() {
    if (this.variantData) return this.variantData;
    try {
      const parsed = JSON.parse(this.querySelector('[type="application/json"]')?.textContent || '{}');
      
      /** @type {any[]} */
      const raw = Array.isArray(parsed.available_variants) ? parsed.available_variants : (Array.isArray(parsed) ? parsed : []);
      
      /** @type {FoxSellVariant[]} */
      this.variantData = raw.map(v => ({
        ...v,
        product: parsed.product ?? null,
        foxsell_price: parsed.allowed_variants?.[v.id] != null ? parsed.allowed_variants[v.id] * 100 : v.price
      }));

      /** @type {FoxSellProduct | null} */
      this.product = parsed.product ?? null;
    } catch (e) {
      console.error('Failed to parse variant data:', e);
      /** @type {FoxSellVariant[]} */
      this.variantData = [];
    }
    return this.variantData ?? [];
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

    if (!this.variantData) return;
    const selectedOptionOneVariants = this.variantData.filter(variant => firstChecked.getAttribute('value') === variant.option1);
    const inputWrappers = [...this.querySelectorAll('fieldset')];
    
    inputWrappers.forEach((option, index) => {
      if (index === 0) return;
      
      const optionInputs = [...option.querySelectorAll('input[type="radio"], option')];
      const previousFieldset = inputWrappers[index - 1];
      const previousChecked = previousFieldset?.querySelector(':checked');
      
      if (!previousChecked) return;
      
      const availableOptionInputsValue = selectedOptionOneVariants
        .filter(variant => variant.available && variant[`option${index}`] === previousChecked.getAttribute('value'))
        .map(variantOption => variantOption[`option${index + 1}`] ?? '')
        .filter(v => v !== '');

      this.setInputAvailability(optionInputs, availableOptionInputsValue);
    });
  }

  /**
   * @description Set the input availability
   * @param {Element[]} listOfOptions
   * @param {string[]} listOfAvailableOptions
   * @returns {void}
   */
  setInputAvailability(listOfOptions, listOfAvailableOptions) {
    listOfOptions.forEach(input => {
      input.toggleAttribute('disabled', !listOfAvailableOptions.includes(input.getAttribute('value') ?? ''));
    });
  }
}

class FoxSellVariantSelect extends FoxSellVariantRadio {
  constructor() {
    super();
  }

  updateOptions() {
    this.options = Array.from(this.querySelectorAll('select'), (select) => select.value);
  }
}

// @ts-check

class FoxSellBundleSummary extends HTMLElement {
  constructor() {
    super();
    /** @type {FoxSellMixMatch | null} */
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

  /**
   * @description Update the bundle summary
   * @param {FoxSellCustomEvent} event
   * @returns {void}
   */
  updateBundleSummary(event) {
    const { bundle } = event.detail;
    const bundleItemsContainer = this.querySelector('.foxsell-bundle-summary__items-list');
    if (!bundle || !bundleItemsContainer) return

    if (!this.emptyStateHTML) {
      this.emptyStateHTML = bundleItemsContainer.innerHTML;
    }

    const items = bundle.items.flatMap((category) =>
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

  //! DO NOT MODIFY THIS METHOD, extend the class to override this method
  /**
   * @description Render the line item
   * @param {FoxSellLineItem} item
   * @returns {string}
   */
  renderLineItem(item) {
    let itemImage = item.featured_image ? item.featured_image.src : item.product.featured_image?.src;
    if (itemImage) {
      itemImage = itemImage.replace('?', '?width=150&');
    }
    let itemPrice = item.foxsell_price;
    let discountedPrice = 0;
    let discount = 0;
    if (!this.foxsell || !this.foxsell.bundle) return '';
    const priceStrategy = this.foxsell.bundle.priceStrategy;
    if (priceStrategy && priceStrategy.strategy === 'dynamic_pricing') {
      discount = priceStrategy.value;
      discountedPrice = item.foxsell_price - (item.foxsell_price * (discount / 100));
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
                <span class="foxsell-slashed-price">${window.foxsell.formatMoney(itemPrice)}</span> 
                <span>(${discount}% off)</span>
              </div>
              <span>${window.foxsell.formatMoney(discountedPrice)} x ${item.quantity}</span>`
              : 
              `<span>${window.foxsell.formatMoney(itemPrice)} x ${item.quantity}</span>`
            }
          </div>
        </div>
        <div>
          <button class="foxsell-bundle-summary__item-delete" aria-label="Remove item from bundle">Delete</button>
        </div>
      </foxsell-bundle-line-item>
    `)
  }
}

class FoxSellBundleLineItem extends HTMLElement {
  constructor() {
    super();
    /** @type {FoxSellMixMatch | null} */
    this.foxsell = this.closest('foxsell-mix-match');
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
    // @ts-ignore
    this.foxsell.removeFromBundle({ id: parseInt(this.dataset.itemId) }, parseInt(this.dataset.quantity || '1'), this.dataset.categoryId);
  }
}

class FoxSellBundleProgress extends HTMLElement {
  constructor() {
    super();
    /** @type {FoxSellMixMatch | null} */
    this.foxsell = this.closest('foxsell-mix-match');
    this._onBundleUpdated = this.updateBundleProgress.bind(this);
    this.config = this.querySelector('#foxsell-bundle-progress-config');

    try {
      this.config = JSON.parse(this.config?.textContent || '{}');
    } catch (error) {
      console.error('Failed to parse foxsell bundle progress config:', error);
    }
  }

  connectedCallback() {
    this.updateBundleProgress();

    if (this.foxsell) {
      this.foxsell.addEventListener(FOXSELL_EVENTS.bundleUpdated, this._onBundleUpdated);
    }
  }

  disconnectedCallback() {
    if (this.foxsell) {
      this.foxsell.removeEventListener(FOXSELL_EVENTS.bundleUpdated, this._onBundleUpdated);
    }
  }

  /**
   * @param {FoxSellBundleProgressConfig} messageConfig
   * @returns {string}
   */
  formatMessage(messageConfig) {
    const { currentStep, maxSteps, currentQuantity, requiredQuantity, remainingQuantity, discount, isCompleted } = messageConfig;
    /** @type {string} */
    let message = '';

    if (currentStep === 0) {
      message = this.config.emptyStateText;
    } else if (isCompleted) {
      message = this.config.endStateText;
    } else {
      message = this.config.progressStateText;
    }

    message = message
    .replaceAll('_currentStep', String(currentStep))
    .replaceAll('_maxSteps', String(maxSteps))
    .replaceAll('_remainingQuantity', String(remainingQuantity))
    .replaceAll('_currentQuantity', String(currentQuantity))
    .replaceAll('_requiredQuantity', String(requiredQuantity))
    .replaceAll('_discount', String(discount));

    return message
  }

  /**
   * @description Get the bundle progress without QAO
   * @returns {FoxSellBundleProgressConfig | undefined}
   */
  getBundleProgressWithoutQAO() {
    if (!this.foxsell || !this.foxsell.config || !this.foxsell.bundle) return undefined;
    const bundle = this.foxsell.bundle.items;
    const maxSteps = this.foxsell.config.categories.reduce((acc, category) => acc + category.quantity, 0);
    const currentStep = bundle.reduce((acc, category) => acc + category.quantity, 0);
    const priceStrategy = this.foxsell.bundle.priceStrategy;
    let discount;
    if (priceStrategy?.strategy === 'dynamic_pricing') {
      discount = (priceStrategy.value ?? 0) + '%';
    } else {
      discount = window.foxsell.formatMoney(parseFloat(String(priceStrategy?.value ?? 0)) * 100);
    }

    return {
      currentStep,
      maxSteps,
      discount,
      currentQuantity: currentStep,
      requiredQuantity: maxSteps,
      remainingQuantity: maxSteps - currentStep,
      isCompleted: currentStep === maxSteps,
      progress: Math.min(Math.round((currentStep / maxSteps) * 100), 100)
    };
  }


  /**
   * @description Get the bundle progress with QAO
   * @returns {FoxSellBundleProgressConfig | undefined}
   */
  getBundleProgressWithQAO() {
    if (!this.foxsell || !this.foxsell.config || !this.foxsell.bundle) return;
    const bundle = this.foxsell.bundle.items;
    const maxSteps = this.foxsell.config.options.length;
    const bundleQuantity = bundle.reduce((acc, category) => acc + category.quantity, 0);

    let eligibleOptionIndex = this.foxsell.config.options.findIndex(option => option.quantity > bundleQuantity);

    let optionIndex = eligibleOptionIndex === -1 ? maxSteps - 1 : eligibleOptionIndex;

    const option = this.foxsell.config.options[optionIndex];
    const price = option?.price;

    let discount;
    if (price?.strategy === 'dynamic_pricing') {
      discount = (price.value ?? 0) + '%';
    } else {
      discount = window.foxsell.formatMoney(parseFloat(String(price?.value ?? 0)) * 100);
    }

    eligibleOptionIndex = optionIndex + 1;

    const currentOption = this.foxsell.config.options[optionIndex];
    const prevOption = optionIndex > 0 ? this.foxsell.config.options[optionIndex - 1] : undefined;

    let isCompleted = (eligibleOptionIndex === maxSteps) && (bundleQuantity >= (currentOption?.quantity ?? 0));

    let currentQuantity = bundleQuantity;
    let requiredQuantity = currentOption?.quantity ?? 0;
    if (prevOption) {
      currentQuantity = bundleQuantity - prevOption.quantity;
      requiredQuantity = (currentOption?.quantity ?? 0) - prevOption.quantity;
    }

    let progress = Math.min(Math.round((currentQuantity / requiredQuantity) * 100), 100);
    
    return {
      currentStep: bundleQuantity > 0 ? eligibleOptionIndex : 0,
      maxSteps,
      progress,
      isCompleted,
      discount,
      currentQuantity,
      requiredQuantity,
      remainingQuantity: requiredQuantity - currentQuantity
    }
  }


  /**
   * @description Get the bundle progress
   * @returns {FoxSellBundleProgressData | undefined}
   */
  getBundleProgress() {
    if (!this.foxsell || !this.foxsell.config || !this.foxsell.bundle) return;
    const qaoEnabled = this.foxsell.bundle.qaoEnabled;
    const progressConfig = qaoEnabled ? this.getBundleProgressWithQAO() : this.getBundleProgressWithoutQAO();
    if (!progressConfig) return;
    const message = this.formatMessage(progressConfig);

    return {
      ...progressConfig,
      qaoEnabled,
      message
    };
  }

  //! DO NOT MODIFY THIS METHOD, extend the class to override this method
  /**
   * @description Update the bundle progress
   * @returns {void}
   */
  updateBundleProgress() {
    //! you also have access to the following properties:
    //! currentStep, maxSteps, message, progress, qaoEnabled, isCompleted, currentQuantity, requiredQuantity, remainingQuantity
    const progressData = this.getBundleProgress();
    if (!progressData) return;
    const { currentStep, maxSteps, message, progress, qaoEnabled } = progressData;
    const progressLabel = this.querySelector('.foxsell-bundle-progress__label');
    if(progressLabel) {
      progressLabel.innerHTML = message;
    }

    const progressBarsWrapper = this.querySelector('.foxsell-bundle-progress__bars');
    if(!progressBarsWrapper) return;

    progressBarsWrapper.innerHTML = '';

    for(let i = 1; i <= maxSteps; i++) {
      const progressBar = document.createElement('div');
      const progressTrack = document.createElement('div');

      progressTrack.classList.add('foxsell-bundle-progress__track');
      progressBar.classList.add('foxsell-bundle-progress__bar');

      if (i < currentStep) {
        progressBar.style.width = '100%';
      } else if (i == currentStep && qaoEnabled) {
        progressBar.style.width = `${progress}%`;
      } else if (i == currentStep && !qaoEnabled) {
        progressBar.style.width = '100%';
      }

      progressTrack.appendChild(progressBar);
      progressBarsWrapper.appendChild(progressTrack);
    }
  }
}

// JS

const elements = [
  ['foxsell-mix-match', FoxSellMixMatch],
  ['foxsell-category-header', FoxSellCategoryHeader],
  ['foxsell-product-card', FoxSellProductCard],
  ['foxsell-bundle-summary', FoxSellBundleSummary],
  ['foxsell-bundle-line-item', FoxSellBundleLineItem],
  ['foxsell-bundle-progress', FoxSellBundleProgress],
  ['foxsell-variant-radio', FoxSellVariantRadio],
  ['foxsell-variant-select', FoxSellVariantSelect],
];


for (const [name, constructor] of elements) {
  if (!customElements.get(name)) customElements.define(name, constructor);
}
