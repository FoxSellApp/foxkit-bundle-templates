'use strict';

const FOXSELL_EVENTS = {
  bundleUpdated: 'foxsell:bundle-updated',
};

class FoxSellMixMatch extends HTMLElement {
  constructor() {
    super();
    this.selectedItems = new Map();
    this.selectedAddOns = new Map();
    this.selectedOption = {};

    this.config = null;

    this.bundle = this.getEmptyBundle();
    this.continueButton = this.querySelector('input[type="checkbox"].toggle-add-ons-checkbox');
    this._handleContinueButtonClick = this.toggleAddOnsCategory.bind(this);

    try {
      const configElement = this.querySelector('#foxsell-config[type="application/json"]');
      this.config = configElement ? JSON.parse(configElement.textContent || '{}') : null;
    } catch (error) {
      console.error('Failed to parse foxsell config:', error);
      this.config = null;
    }
  }

  getEmptyBundle() {
    return {
      items: [],
      addOns: {
        addOnStrategy: '',
        enabled: false,
        minimum: 0,
        maximum: 0,
        selectedQuantity: 0,
        isMaxedOut: false,
        allowedIds: [],
        items: []
      },
      isValid: false,
      isAddOnsValid: false,
      isItemsValid: false,
      originalTotalPrice: 0,
      totalPrice: 0,
      totalDiscount: 0,
      id: '',
      qaoEnabled: false,
      priceStrategy: null,
    };
  }

  getCurrentPriceStrategy() {
    if (!this.config) return null;
    const qaoEnabled = (this.config.options?.length ?? 0) > 0;
    if (!qaoEnabled) return this.config.settings.price;

    const items = this.getSelectedItems().flatMap(category =>
      Array.isArray(category.items) ? category.items : []
    );
    const itemsCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const currentValidOption = this.config.options.findLast(opt => Number(opt.quantity ?? opt) <= itemsCount);
    return currentValidOption?.price ?? null;
  }

  getCurrentValidOption() {
    if (!this.config || !this.config.options?.length) return null;

    const items = this.getSelectedItems().flatMap(category =>
      Array.isArray(category.items) ? category.items : []
    );
    const itemsCount = items.reduce((sum, item) => sum + item.quantity, 0);
    return this.config.options.findLast(opt => Number(opt.quantity ?? opt) <= itemsCount) ?? null;
  }

  buildBundle(isValid, isAddOnsValid, isItemsValid) {
    if (!this.config) return this.getEmptyBundle();

    const qaoEnabled = (this.config.options?.length ?? 0) > 0;
    const items = this.getSelectedItems();
    const addOnItems = this.getSelectedAddOns();
    const { originalTotalPrice, totalPrice, totalDiscount } = this.getTotalPrice();
    const id = this.config.bundleId ? `${this.config.bundleId}_${Date.now()}` : '';
    const priceStrategy = this.getCurrentPriceStrategy();

    const { allowedIds, minimum, maximum, isMaxedOut, addOnStrategy, selectedQuantity } = this.getAddOnsConfig();

    const addOns = {
      addOnStrategy,
      enabled: allowedIds.length > 0,
      minimum,
      maximum,
      selectedQuantity,
      isMaxedOut,
      allowedIds,
      items: addOnItems
    };

    return {
      items,
      addOns,
      isValid,
      isAddOnsValid,
      isItemsValid,
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
    if (this.continueButton) {
      this.continueButton.addEventListener('change', this._handleContinueButtonClick);
    }
  }

  getCategoryConfig(categoryId) {
    if (!this.config) return undefined;
    return this.config.categories?.find((category) => category.id === categoryId);
  }

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

  getItem(itemId, categoryId) {
    const selectedCategory = this.getCategory(categoryId);
    if (!selectedCategory) return undefined;

    return selectedCategory.items.get(itemId);
  }

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

  getSelectedAddOns() {
    return Array.from(this.selectedAddOns.values());
  }

  addToBundle(item, quantity, categoryId, dispatchEvent = true) {
    const selectedCategory = this.getCategory(categoryId, true);
    if (!selectedCategory || !this.config) return;

    const qaoEnabled = this.config.options.length > 0;
    if (((selectedCategory.quantity + quantity) > selectedCategory.maxQuantity) && !qaoEnabled) return;

    if (item.inventory_management && item.inventory_policy !== 'continue') {
      const currentQuantity = this.getItem(item.id, categoryId)?.quantity ?? 0;
      if ((currentQuantity + quantity) > item.inventory_quantity) return;
    }

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

    if (!dispatchEvent) return;
    this.dispatchEvent(new CustomEvent(FOXSELL_EVENTS.bundleUpdated, {
      detail: {
        bundle: this.bundle,
        action: 'add',
        item: this.getItem(item.id, categoryId),
        category: this.bundle.items.find((c) => c.id === categoryId),
      }
    }));
  }

  removeFromBundle(item, quantity, categoryId, dispatchEvent = true) {
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

    if (!dispatchEvent) return;
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

  addToAddOns(item, quantity, dispatchEvent = true) {
    if (!item || !quantity || quantity <= 0) return;

    const existingAddOn = this.selectedAddOns.get(item.id);
    if (existingAddOn) {
      existingAddOn.quantity += quantity;
    } else {
      this.selectedAddOns.set(item.id, {
        ...item,
        quantity: quantity,
      });
    }

    this.validateBundle();

    if (!dispatchEvent) return;
    this.dispatchEvent(new CustomEvent(FOXSELL_EVENTS.bundleUpdated, {
      detail: {
        bundle: this.bundle,
        action: 'add-addon',
        item: this.selectedAddOns.get(item.id),
      }
    }));
  }

  removeFromAddOns(item, quantity, dispatchEvent = true) {
    if (!item || !quantity || quantity <= 0) return;

    const existingAddOn = this.selectedAddOns.get(item.id);
    if (!existingAddOn) return;

    const newQuantity = Math.max(existingAddOn.quantity - quantity, 0);
    if (newQuantity === 0) {
      this.selectedAddOns.delete(item.id);
    } else {
      existingAddOn.quantity = newQuantity;
    }

    this.validateBundle();

    if (!dispatchEvent) return;
    this.dispatchEvent(new CustomEvent(FOXSELL_EVENTS.bundleUpdated, {
      detail: {
        bundle: this.bundle,
        action: 'remove-addon',
        item: {
          ...existingAddOn,
          quantity: newQuantity,
        },
      }
    }));
  }

  clearAddOns() {
    this.selectedAddOns.clear();
    this.dispatchEvent(new CustomEvent(FOXSELL_EVENTS.bundleUpdated, {
      detail: {
        bundle: this.bundle,
        action: 'clear-addons',
      }
    }));
  }

  validateBundle() {
    if (!this.config) return;
    const qaoEnabled = this.config.options?.length > 0;
    const isItemsValid = qaoEnabled ? this.validateBundleWithQAO() : this.validateBundleWithoutQAO();
    const isAddOnsValid = this.validateAddOns();

    const isValid = isItemsValid && isAddOnsValid;
    this.bundle = this.buildBundle(isValid, isAddOnsValid, isItemsValid);

    this.updateLineItemProperties();
    this.toggleContinueButton();
    this.renderPrice();
    this.toggleAddToCartButton(!isValid);
  }

  validateAddOns() {
    return true;
  }

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

  getAddOnsConfig() {
    return {
      addOnStrategy: '',
      allowedIds: [],
      enabled: false,
      minimum: 0,
      maximum: 0,
      selectedQuantity: 0,
      isMaxedOut: false
    };
  }

  updateLineItemProperties() {
    const bundleIdInput = this.querySelector('input[name="properties[__foxsell:dynamic_add_on_bundle_id]"]');
    const itemInput = this.querySelector('input[name="properties[__foxsell:dynamic_add_on_bundle_items]"]');
    const savingsInput = this.querySelector('input[name="properties[__foxsell:dynamic_add_on_bundle_savings]"]');
    const idInput = this.querySelector('input[name="id"]');

    if (!itemInput || !bundleIdInput || !this.config?.bundleId) return;

    bundleIdInput.setAttribute('value', this.bundle.id);

    if (this.bundle.qaoEnabled) {
      const validOption = this.getCurrentValidOption();
      if (idInput) {
        idInput.setAttribute('value', validOption?.variant_id ?? '');
      }
    }

    const lineItems = this.bundle.items.flatMap(category =>
      (category.items || []).map(item => ({
        variantId: Number(item.id) || item.id,
        quantity: item.quantity || 1,
        category: category.title,
        type: 'product',
        properties: item.properties || {}
      }))
    );

    const addOnLineItems = this.bundle.addOns.items.map(item => ({
      variantId: Number(item.id) || item.id,
      quantity: item.quantity || 1,
      category: '',
      type: 'addOns',
      properties: item.properties || {}
    }));

    lineItems.push(...addOnLineItems);

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

  getTotalPrice() {
    if (!this.config) return { originalTotalPrice: 0, totalPrice: 0, totalDiscount: 0 };

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

    const addOnItems = this.getSelectedAddOns().map(item => ({
      ...item,
      category: {
        id: '__add_ons__',
        title: 'AddOns',
        quantity: item.quantity,
        maxQuantity: 1
      }
    }));

    const addOnsTotalPrice = addOnItems.reduce((sum, item) => sum + item.foxsell_price * item.quantity, 0);

    const priceStrategy = this.getCurrentPriceStrategy();
    let originalTotalPrice = items.reduce((sum, item) => sum + item.foxsell_price * item.quantity, 0);
    let totalPrice = 0;
    if (priceStrategy && priceStrategy.strategy === 'dynamic_pricing') {
      const discount = priceStrategy.value;
      totalPrice = originalTotalPrice - (originalTotalPrice * (discount / 100));
    } else if (priceStrategy) {
      totalPrice = priceStrategy.value * 100;
    }

    totalPrice += addOnsTotalPrice;
    originalTotalPrice += addOnsTotalPrice;

    const totalDiscount = originalTotalPrice - totalPrice;
    return { originalTotalPrice, totalPrice, totalDiscount };
  }

  renderPrice() {
    const addToCartButton = this.querySelector('button[type="submit"]');
    if (!addToCartButton) return;

    if (!this.initialAddToCartButtonHTML) {
      this.initialAddToCartButtonHTML = addToCartButton.innerHTML;
    }

    const { originalTotalPrice, totalPrice } = this.bundle;
    if (originalTotalPrice > 0 && totalPrice > 0 && (totalPrice !== originalTotalPrice)) {
      addToCartButton.innerHTML = `${this.initialAddToCartButtonHTML} -
      <span class="foxsell-slashed-price">${window.foxsell?.formatMoney?.(originalTotalPrice)}</span>
      <span>${window.foxsell?.formatMoney?.(totalPrice)}</span>`;
    } else {
      addToCartButton.innerHTML = this.initialAddToCartButtonHTML;
    }
  }

  toggleAddToCartButton(disable) {
    const addToCartButton = this.querySelector('button[type="submit"]');
    if (!addToCartButton) return;
    addToCartButton.toggleAttribute('disabled', disable);
  }

  toggleContinueButton() {
    if (!this.continueButton) return;
    const isAddOnEnabled = this.bundle.addOns.enabled;
    const isItemsValid = this.bundle.isItemsValid;

    const canContinue = isItemsValid && isAddOnEnabled;
    this.continueButton.toggleAttribute('disabled', !canContinue);
    this.continueButton.closest('label')?.classList.toggle('foxsell--hidden', !isAddOnEnabled);

    const addToCartButton = this.querySelector('.foxsell-add-to-cart-button');

    if (!isAddOnEnabled) {

      addToCartButton?.classList.remove('foxsell--hidden');
      addToCartButton?.toggleAttribute('disabled', !isItemsValid);
    } else {

      const hasContinued = this.continueButton?.checked;
      if (hasContinued) {
        addToCartButton?.classList.remove('foxsell--hidden');
      } else {
        addToCartButton?.classList.add('foxsell--hidden');
      }
    }
  }

  toggleAddOnsCategory(event) {

    const showAddOns = event?.target.checked;
    const categories = this.querySelectorAll('.foxsell-category__item');
    const addToCartButton = this.querySelector('.foxsell-add-to-cart-button');

    categories.forEach(category => {
      const isAddOn = category.getAttribute('data-category') === '__add_ons__';
      category.classList.toggle('active', showAddOns === isAddOn);
    });

    addToCartButton?.classList.toggle('foxsell--hidden', !showAddOns);
  }
}

class FoxSellBundleSummary extends HTMLElement {
  constructor() {
    super();

    this.foxsell = this.closest('foxsell-mix-match');
    this.boundUpdateBundleSummary = this.updateBundleSummary.bind(this);
  }

  connectedCallback() {
    if (this.foxsell) {
      this.foxsell.addEventListener(FOXSELL_EVENTS.bundleUpdated, this.boundUpdateBundleSummary);
    }
  }

  disconnectedCallback() {
    if (this.foxsell) {
      this.foxsell.removeEventListener(FOXSELL_EVENTS.bundleUpdated, this.boundUpdateBundleSummary);
    }
  }

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

    const addOnItems = bundle.addOns.items.map(item => ({
      ...item,
      category: {
        id: '__add_ons__',
        title: 'AddOns',
        quantity: item.quantity,
        maxQuantity: 1
      }
    }));

    const allItems = [...items, ...addOnItems];

    if (!allItems || allItems.length === 0) {
      bundleItemsContainer.innerHTML = this.emptyStateHTML;
      return;
    }

    bundleItemsContainer.innerHTML = allItems.map(item => {
      return this.renderLineItem(item);
    }).join('');
  }

  //! DO NOT MODIFY THIS METHOD, extend the class to override this method

  renderLineItem(item) {
    let itemImage = item.featured_image ? item.featured_image.src : item.product.featured_image?.src;
    if (itemImage) {
      const separator = itemImage.includes('?') ? '&' : '?';
      itemImage = itemImage + separator + 'width=150';
    }
    let itemPrice = item.foxsell_price;
    let discountedPrice = 0;
    let discount = 0;
    if (!this.foxsell || !this.foxsell.bundle) return '';
    const priceStrategy = this.foxsell.bundle.priceStrategy;

    //! Only apply price strategy to items, not add-ons
    if (item.category.id !== '__add_ons__') {
      if (priceStrategy && priceStrategy.strategy === 'dynamic_pricing') {
        discount = priceStrategy.value;
        discountedPrice = item.foxsell_price - (item.foxsell_price * (discount / 100));
      }
    }

    return (`
      <foxsell-bundle-line-item data-item-id="${item.id}" data-category-id="${item.category.id}" data-category-title="${item.category.title}" data-quantity="${item.quantity}" class="foxsell-bundle-summary__item">
        <div><img src="${itemImage}"/></div>
        <div>
          ${item.category.id == '__add_ons__' ? `<sub>Add-On</sub>` : ''}
          <div>${item.product.title}</div>
          ${item.option1 != 'Default Title' ? `<div>${item.options.join(", ")}</div>` : ''}
          <div>
            ${discountedPrice > 0 ? `
              <div>
                <span class="foxsell-slashed-price">${window.foxsell?.formatMoney?.(itemPrice)}</span>
                <span>(${discount}% off)</span>
              </div>
              <span>${window.foxsell?.formatMoney?.(discountedPrice)} x ${item.quantity}</span>`
              :
              `<span>${window.foxsell?.formatMoney?.(itemPrice)} x ${item.quantity}</span>`
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

    this.foxsell = this.closest('foxsell-mix-match');
    this.boundHandleItemDelete = this.handleItemDelete.bind(this);
  }

  connectedCallback() {
    this.deleteButton = this.querySelector('button.foxsell-bundle-summary__item-delete');
    if (this.deleteButton) {
      this.deleteButton.addEventListener('click', this.boundHandleItemDelete);
    }
  }

  disconnectedCallback() {
    if (this.deleteButton) {
      this.deleteButton.removeEventListener('click', this.boundHandleItemDelete);
    }
  }

  handleItemDelete() {
    if (!this.foxsell) return;

    if (this.dataset.categoryId === '__add_ons__') {

      this.foxsell.removeFromAddOns({ id: parseInt(this.dataset.itemId) }, parseInt(this.dataset.quantity || '1'));
    } else {

      this.foxsell.removeFromBundle({ id: parseInt(this.dataset.itemId) }, parseInt(this.dataset.quantity || '1'), this.dataset.categoryId);
    }
  }
}

class FoxSellBundleProgress extends HTMLElement {
  constructor() {
    super();

    this.foxsell = this.closest('foxsell-mix-match');
    this.boundUpdateBundleProgress = this.updateBundleProgress.bind(this);
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
      this.foxsell.addEventListener(FOXSELL_EVENTS.bundleUpdated, this.boundUpdateBundleProgress);
    }
  }

  disconnectedCallback() {
    if (this.foxsell) {
      this.foxsell.removeEventListener(FOXSELL_EVENTS.bundleUpdated, this.boundUpdateBundleProgress);
    }
  }

  formatMessage(messageConfig) {
    const { currentStep, maxSteps, currentQuantity, requiredQuantity, remainingQuantity, discount, isCompleted } = messageConfig;

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
      discount = window.foxsell?.formatMoney?.(parseFloat(String(priceStrategy?.value ?? 0)) * 100);
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
      discount = window.foxsell?.formatMoney?.(parseFloat(String(price?.value ?? 0)) * 100);
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

  updateBundleProgress() {
    //! you also have access to the following properties:
    //! currentStep, maxSteps, message, progress, qaoEnabled, isCompleted, currentQuantity, requiredQuantity, remainingQuantity
    const progressData = this.getBundleProgress();
    if (!progressData) return;
    const { currentStep, maxSteps, message, progress, qaoEnabled } = progressData;
    const progressLabel = this.querySelector('.foxsell-bundle-progress__label');
    if (progressLabel) {
      progressLabel.innerHTML = message;
    }

    const progressBarsWrapper = this.querySelector('.foxsell-bundle-progress__bars');
    if (!progressBarsWrapper) return;

    progressBarsWrapper.innerHTML = '';

    for (let i = 1; i <= maxSteps; i++) {
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

  updateQuantity(event) {
    if (this.categoryId === '__add_ons__') {
      this.updateAddOnQuantity(event);
      return;
    }
    const { category } = event.detail;
    if (!category) return;
    if (category.id !== this.categoryId) return;
    if (!this.quantityElement) return;
    this.quantityElement.textContent = `${category.quantity}/${category.maxQuantity}`;
  }

  updateAddOnQuantity(event) {
    const { bundle } = event.detail;
    if (!bundle) return;
    if (!this.quantityElement) return;
    this.quantityElement.textContent = `${bundle.addOns.selectedQuantity}/${bundle.addOns.maximum}`;
  }
}

class FoxSellProductCard extends HTMLElement {
  constructor() {
    super();

    this.foxsell = this.closest('foxsell-mix-match');

    this.variantSelector = this.querySelector('foxsell-variant-radio') || this.querySelector('foxsell-variant-select');
    this.disableAddToBundle = false;
    this.boundAddToBundle = this.addToBundle.bind(this);
    this.boundRemoveFromBundle = this.removeFromBundle.bind(this);
    this.boundHandleVariantChange = this.handleVariantChange.bind(this);
    this.boundHandleBundleUpdated = this.handleBundleUpdated.bind(this);
    this.categoryId = this.getAttribute('data-category') || null;
    this.productId = parseInt(this.getAttribute('data-product-id') || '0');

    if (this.categoryId === '__add_ons__') {
      this.disableAddToBundle = true;
      this.toggleAddToBundleButton(true);
    }
  }

  connectedCallback() {
    this.querySelectorAll('.add-to-bundle').forEach(btn => btn.addEventListener('click', this.boundAddToBundle));
    this.querySelectorAll('.remove-from-bundle').forEach(btn => btn.addEventListener('click', this.boundRemoveFromBundle));
    if (this.variantSelector) {
      this.addEventListener('variant-change', this.boundHandleVariantChange);
    }

    if (this.foxsell) {
      this.foxsell.addEventListener(FOXSELL_EVENTS.bundleUpdated, this.boundHandleBundleUpdated);
    }
  }

  disconnectedCallback() {
    this.querySelectorAll('.add-to-bundle').forEach(btn => btn.removeEventListener('click', this.boundAddToBundle));
    this.querySelectorAll('.remove-from-bundle').forEach(btn => btn.removeEventListener('click', this.boundRemoveFromBundle));
    if (this.variantSelector) {
      this.removeEventListener('variant-change', this.boundHandleVariantChange);
    }

    if (this.foxsell) {
      this.foxsell.removeEventListener(FOXSELL_EVENTS.bundleUpdated, this.boundHandleBundleUpdated);
    }
  }

  handleVariantChange() {
    this.updateFeaturedImage();
    this.updatePrice();
    if (this.categoryId === '__add_ons__') {
      this.updateQuantity(this.getCurrentAddOnQuantity());
    } else {
      this.updateQuantity(this.getCurrentQuantity());
    }
    this.toggleAddToBundleButton(false);
    if (!this.variantSelector?.currentVariant) {
      this.toggleAddToBundleButton(true);
    } else {
      const atLimit = this.categoryId === '__add_ons__'
        ? this.isAddOnAtInventoryLimit()
        : this.isVariantAtInventoryLimit();
      this.disableAddToBundle = atLimit;
      this.toggleAddToBundleButton(atLimit);
    }
  }

  handleBundleUpdated(event) {
    if (event.detail.action === 'clear') {
      this.updateQuantity(0);
      const atInventoryLimit = this.categoryId === '__add_ons__'
        ? this.isAddOnAtInventoryLimit()
        : this.isVariantAtInventoryLimit();
      this.disableAddToBundle = atInventoryLimit;
      this.toggleAddToBundleButton(atInventoryLimit);
      return;
    }

    if (this.categoryId === '__add_ons__') {
      this.handleAddOnUpdated(event);
      return;
    }

    if (!this.foxsell || !this.foxsell.config) return;

    const qaoEnabled = this.foxsell.config.options.length > 0;

    if (event.detail.action === 'refresh') {
      this.updateQuantity(this.getCurrentQuantity());
      if (qaoEnabled) this.updatePrice();
      return;
    }

    if (event.detail.action !== 'add' && event.detail.action !== 'remove') return;

    const { category, item } = event.detail;
    const disableAddToBundle = category.isMaxQuantity;

    if (!qaoEnabled && this.categoryId !== category.id) return;

    this.disableAddToBundle = disableAddToBundle || this.isVariantAtInventoryLimit();
    this.toggleAddToBundleButton(this.disableAddToBundle);

    if (qaoEnabled) this.updatePrice();

    if (this.productId === item.product.id) {
      this.updateQuantity(this.getCurrentQuantity());
    }
  }

  handleAddOnUpdated(event) {
    const { action } = event.detail;

    if (action === 'clear-addons') {
      this.updateQuantity(0);
      return;
    }

    if (action === 'refresh') {
      this.updateQuantity(this.getCurrentAddOnQuantity());
      return;
    }

    const { item, bundle } = event.detail;
    if (!item || !bundle) return;

    const { enabled, allowedIds, isMaxedOut } = bundle.addOns;

    const isAllowed = allowedIds.includes(this.variantSelector?.product?.id ?? 0);

    if (isAllowed) {
      this.classList.add('active');
    } else {
      this.classList.remove('active');
    }

    const disableAddToBundle = !enabled || !isAllowed || isMaxedOut;

    this.disableAddToBundle = disableAddToBundle || this.isAddOnAtInventoryLimit();
    this.toggleAddToBundleButton(disableAddToBundle);

    if (this.productId === item.product.id) {
      this.updateQuantity(this.getCurrentAddOnQuantity());
    }
  }

  getCurrentQuantity() {
    const variantId = this.variantSelector?.currentVariant?.id;
    if (variantId === undefined || variantId === null || !this.foxsell?.bundle || !this.categoryId) return 0;
    const category = this.foxsell.bundle.items.find((c) => c.id === this.categoryId);
    if (!category) return 0;
    return category.items.find((item) => item.id === variantId)?.quantity ?? 0;
  }

  getCurrentAddOnQuantity() {
    const variantId = this.variantSelector?.currentVariant?.id;
    if (variantId === undefined || variantId === null || !this.foxsell?.bundle || !this.categoryId) return 0;
    const addOns = this.foxsell.bundle.addOns;
    if (!addOns || !addOns.items) return 0;
    return addOns.items.find((item) => item.id === variantId)?.quantity ?? 0;
  }

  updateFeaturedImage() {
    if (!this.variantSelector || !this.variantSelector.currentVariant) return;
    const img = this.querySelector('.foxsell-product-card__image');
    const image = this.variantSelector.currentVariant?.featured_image || this.variantSelector.currentVariant?.product?.featured_image;
    if (!img || !image?.src) return;
    img.setAttribute('src', image.src);
    if (image.width != null) img.setAttribute('srcset', image.src + (image.src.includes('?') ? '&' : '?') + 'width=' + image.width);
  }

  updatePrice() {
    if (!this.variantSelector || !this.foxsell || !this.foxsell.bundle) return;
    const priceEl = this.querySelector('.foxsell-product-card__price');
    if (!priceEl) return;

    const { currentVariant, product } = this.variantSelector;
    let price = currentVariant?.foxsell_price ?? currentVariant?.product?.price ?? product?.price ?? 0;

    let discountedPrice = 0;
    const priceStrategy = this.foxsell.bundle.priceStrategy;
    if (priceStrategy && priceStrategy.strategy === 'dynamic_pricing') {
      const discount = priceStrategy.value;
      discountedPrice = price - (price * (discount / 100));
    }

    if (discountedPrice > 0) {
      priceEl.innerHTML = `
      <span class="foxsell-slashed-price">${window.foxsell?.formatMoney?.(price)}</span>
      <span class="foxsell-price">${window.foxsell?.formatMoney?.(discountedPrice)}</span>`;
    } else {
      priceEl.innerHTML = `<span>${window.foxsell?.formatMoney?.(price)}</span>`;
    }
  }

  updateQuantity(quantity) {
    const el = this.querySelector('.quantity');
    if (el) el.textContent = String(quantity);
  }

  isVariantAtInventoryLimit() {
    const variant = this.variantSelector?.currentVariant;
    if (!variant || !this.foxsell || !this.categoryId) return false;

    if (!variant.inventory_management || variant.inventory_policy === 'continue') return false;
    const currentQuantity = this.getCurrentQuantity();
    return currentQuantity >= variant.inventory_quantity;
  }

  isAddOnAtInventoryLimit() {
    const variant = this.variantSelector?.currentVariant;
    if (!variant || !this.foxsell || !this.categoryId) return false;
    if (!variant.inventory_management || variant.inventory_policy === 'continue') return false;
    const currentQuantity = this.getCurrentAddOnQuantity() ?? 0;
    return currentQuantity >= variant.inventory_quantity;
  }

  addToBundle() {
    if (!this.variantSelector || !this.variantSelector.currentVariant || !this.foxsell || !this.categoryId) return;
    if (this.categoryId === '__add_ons__') {

      this.foxsell.addToAddOns(this.variantSelector.currentVariant, 1);
      if (this.isAddOnAtInventoryLimit()) {
        this.toggleAddToBundleButton(true);
      }
    } else {
      this.foxsell.addToBundle(this.variantSelector.currentVariant, 1, this.categoryId);
      if (this.isVariantAtInventoryLimit()) {
        this.toggleAddToBundleButton(true);
      }
    }
  }

  removeFromBundle() {
    if (!this.variantSelector || !this.variantSelector.currentVariant || !this.foxsell || !this.categoryId) return;
    if (this.categoryId === '__add_ons__') {

      this.foxsell.removeFromAddOns(this.variantSelector.currentVariant, 1);
    } else {
      this.foxsell.removeFromBundle(this.variantSelector.currentVariant, 1, this.categoryId);
    }
  }

  toggleAddToBundleButton(disable) {
    this.querySelectorAll('.add-to-bundle').forEach(btn => {
      btn.toggleAttribute('disabled', disable || this.disableAddToBundle);
    });
  }
}

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

    this.dispatchEvent(new CustomEvent('variant-change', { bubbles: true }));
  }

  updateOptions() {
    this.options = [...this.querySelectorAll('fieldset')].map(fs =>
      fs.querySelector('input:checked')?.getAttribute('value') ?? ''
    );
  }

  getFoxSellPrice(allowedVariants, variantId) {
    if (!allowedVariants || !variantId) return 0;
    let foxsell_price = 0;

    if (allowedVariants[variantId]) {
      foxsell_price = allowedVariants[variantId] * 100;
    } else if (allowedVariants[`gid://shopify/ProductVariant/${variantId}`]) {
      foxsell_price = allowedVariants[`gid://shopify/ProductVariant/${variantId}`] * 100;
    }

    return foxsell_price;
  }

  getVariantData() {
    if (this.variantData) return this.variantData;
    try {
      const parsed = JSON.parse(this.querySelector('[type="application/json"]')?.textContent || '{}');

      const raw = Array.isArray(parsed.available_variants) ? parsed.available_variants : (Array.isArray(parsed) ? parsed : []);

      this.variantData = raw.map(v => ({
        ...v,
        product: parsed.product ?? null,
        foxsell_price: this.getFoxSellPrice(parsed.allowed_variants, v.id)
      }));

      this.product = parsed.product ?? null;
    } catch (e) {
      console.error('Failed to parse variant data:', e);

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

class FoxSellProductModal extends HTMLElement {
  constructor() {
    super();

    this.foxsell = this.closest('foxsell-mix-match');

    this.modal = this.querySelector('dialog[data-modal]');
    this.content = this.querySelector('.foxsell-product-modal__content');
    this.closeButton = this.querySelector('#foxsell-product-modal-close-button');
    this.boundCloseModal = this.closeModal.bind(this);
    this.boundOpenModal = this.openModal.bind(this);
    this.emptyState = this.querySelector('.foxsell-product-modal__empty-state');
  }

  connectedCallback() {
    const productCards = this.closest('foxsell-mix-match')?.querySelectorAll('foxsell-product-card');
    if(productCards && productCards.length > 0) {
      productCards.forEach(card => {
        card.querySelector('[data-open-modal]')?.addEventListener('click', this.boundOpenModal);
      });
    }

    if(this.closeButton) {
      this.closeButton.addEventListener('click', this.boundCloseModal);
    }
  }

  disconnectedCallback() {
    const productCards = this.closest('foxsell-mix-match')?.querySelectorAll('foxsell-product-card');
    if(productCards && productCards.length > 0) {
      productCards.forEach(card => {
        card.querySelector('[data-open-modal]')?.removeEventListener('click', this.boundOpenModal);
      });
    }

    if(this.closeButton) {
      this.closeButton.removeEventListener('click', this.boundCloseModal);
    }
  }

  openModal(event) {
    if(!this.modal) return;
    this.modal.showModal();

    if(this.content) this.content.innerHTML = this.emptyState?.outerHTML || '';

    if(!event.target) return;

    const productId = event.target?.closest('foxsell-product-card')?.dataset.productId;
    if(!productId) return;
    this.renderProductModal(productId);
  }

  closeModal() {
    if(!this.modal || !this.content) return;
    this.content.innerHTML = '';
    this.modal.close();
  }

  async renderProductModal(productId) {
    if(!this.foxsell || !this.foxsell.config) return;

    try {
      const productHandle = this.foxsell.config.productHandle;
      const response = await(await fetch(`/products/${productHandle}?sections=foxsell-glow-product-modal`)).json();

      const parser = new DOMParser();
      const doc = parser.parseFromString(response['foxsell-glow-product-modal'], 'text/html');

      const productModal = doc.querySelector('foxsell-product-card[data-product-id="' + productId + '"]');
      if(!productModal || !this.content) return;
      this.content.innerHTML = productModal.outerHTML;
    } catch(error) {
      console.error('Failed to render product modal:', error);
    }
  }
}

class FoxSellProductGallery extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {

    const firstImage = this.querySelector('.foxsell-product-gallery__image');
    if (firstImage) {
      this.setFeaturedImage(firstImage);
      firstImage.classList.add('is-active');
    }

    const images = this.querySelectorAll('.foxsell-product-gallery__image');
    images.forEach(image => {
      image.addEventListener('click', (event) => {

        this.updateFeaturedImage(image);
      });
    });
  }

  setFeaturedImage(image) {
    const featuredImage = document.createElement('img');
    featuredImage.classList.add('js', 'foxsell-product-card__image');
    featuredImage.setAttribute('src', image.src);
    featuredImage.setAttribute('srcset', image.src);
    this.prepend(featuredImage);
  }

  updateFeaturedImage(image) {
    this.querySelector('.foxsell-product-gallery__image.is-active')?.classList.remove('is-active');
    image.classList.add('is-active');
    const featuredImage = this.querySelector('.foxsell-product-card__image');
    if(featuredImage) {
      featuredImage.setAttribute('src', image.src);
      featuredImage.setAttribute('srcset', image.src);
    }
  }
}

class GlowProductCard extends FoxSellProductCard {
  constructor() {
    super();
  }

    updateQuantity(quantity) {
      const el = this.querySelector('.quantity');
      if (el) el.textContent = String(quantity);
      this.classList.toggle('is-in-bundle', quantity > 0);
    }
}

class GlowBundleSummary extends FoxSellBundleSummary {
  constructor() {
    super();
  }

  //! MODIFY THIS METHOD

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

    //! Only apply price strategy to items, not add-ons
    if(item.category.id !== '__add_ons__'){
      if (priceStrategy && priceStrategy.strategy === 'dynamic_pricing') {
        discount = priceStrategy.value;
        discountedPrice = item.foxsell_price - (item.foxsell_price * (discount / 100));
      }
    }

    return (`
      <foxsell-bundle-line-item data-item-id="${item.id}" data-category-id="${item.category.id}" data-category-title="${item.category.title}" data-quantity="${item.quantity}" class="foxsell-bundle-summary__item">
        <div><img src="${itemImage}" class="foxsell-bundle-summary__item-image" /></div>
        <div>
          ${item.category.id === '__add_ons__' ? `<sub>Add-On</sub>` : ''}
          <div class="foxsell-bundle-summary__item-title">${item.product.title}</div>
          ${item.option1 !== 'Default Title' ? `<div>${item.options.join(", ")}</div>` : ''}
          <div class="foxsell-bundle-summary__item-price">
            ${discountedPrice > 0 ? `
              <div>
                <span class="foxsell-slashed-price">${window.foxsell.formatMoney(itemPrice)}</span>
                <span>(${discount}% off)</span>
              </div>
              <span>${window.foxsell.formatMoney(discountedPrice)}</span>`
              :
              `<span>${window.foxsell.formatMoney(itemPrice)}</span>`
            }
          </div>
        </div>
        <div class="foxsell-bundle-summary__item-quantity">x ${item.quantity}</div>
        <div>
          <button class="foxsell-bundle-summary__item-delete" aria-label="Remove item from bundle">
            <svg xmlns="http://www.w3.org/2000/svg" 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              stroke-width="2" 
              stroke-linecap="round" 
              stroke-linejoin="round"
            >
              <path d="M10 11v6"/>
              <path d="M14 11v6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
              <path d="M3 6h18"/>
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </foxsell-bundle-line-item>
    `)
  }
}

class GlowBundleProgressBar extends FoxSellBundleProgress {
  constructor() {
    super();
  }

  updateBundleProgress() {
    //! you also have access to the following properties:
    //! currentStep, maxSteps, message, progress, qaoEnabled, isCompleted, currentQuantity, requiredQuantity, remainingQuantity
    const progressData = this.getBundleProgress();
    if (!progressData) return;
    const { currentStep, maxSteps, message, progress, qaoEnabled } = progressData;

    //! Update the total quantity in the bundle summary header
    const quantityEl = this.foxsell?.querySelector('.foxsell-bundle-summary__quantity');
    if (quantityEl && this.foxsell?.bundle) {
      const total = this.foxsell.bundle.items.reduce((acc, category) => acc + category.quantity, 0)
        + this.foxsell.bundle.addOns.items.reduce((acc, item) => acc + item.quantity, 0);
      quantityEl.textContent = `(${total})`;
    }

    //! Update the bundle pack progress
    const bundlePackProgress = this.querySelector('.foxsell-bundle-pack__progress');
    if (bundlePackProgress) {
      this.updateBundlePackProgress(progressData);
    }

    //! Update the progress label
    const progressLabel = this.querySelector('.foxsell-bundle-progress__label');
    if (progressLabel) {
      progressLabel.innerHTML = message;
    }

    //! Update the progress bars
    const progressBarsWrapper = this.querySelector('.foxsell-bundle-progress__bars');
    if (!progressBarsWrapper) return;

    progressBarsWrapper.innerHTML = '';

    for (let i = 1; i <= maxSteps; i++) {
      const progressBar = document.createElement('div');
      const progressTrack = document.createElement('div');

      progressTrack.classList.add('foxsell-bundle-progress__track');
      progressBar.classList.add('foxsell-bundle-progress__bar');

      if (i < currentStep) {
        progressBar.style.width = '100%';
      } else if (i === currentStep && qaoEnabled) {
        progressBar.style.width = `${progress}%`;
      } else if (i === currentStep && !qaoEnabled) {
        progressBar.style.width = '100%';
      }

      progressTrack.appendChild(progressBar);
      progressBarsWrapper.appendChild(progressTrack);
    }
  }

  updateBundlePackProgress(progressData) {
    const { currentStep, maxSteps, message, progress, qaoEnabled } = progressData;
    if (!this.foxsell) return;
    const { originalTotalPrice, totalPrice } = this.foxsell.getTotalPrice();
    const priceWrapper = this.querySelector('.foxsell-bundle-summary__price-value');

    if(priceWrapper){
      if (originalTotalPrice > 0 && totalPrice > 0 && (totalPrice !== originalTotalPrice)) {
        priceWrapper.innerHTML = `<span class="foxsell-slashed-price">${window.foxsell?.formatMoney?.(originalTotalPrice)}</span>
        <span>${window.foxsell?.formatMoney?.(totalPrice)}</span>`;
      } else {
        priceWrapper.innerHTML = `${window.foxsell?.formatMoney?.(originalTotalPrice)}`;
      }
    }

    const bundlePackProgressItems = this.querySelectorAll('.foxsell-bundle-pack__progress-item');
    const currentValidOption = this.foxsell.getCurrentValidOption()?.title ?? '';
    if (bundlePackProgressItems.length > 0 && currentValidOption !== '') {
      bundlePackProgressItems.forEach(item => {
        if (item.dataset.id === currentValidOption) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    } else {
      bundlePackProgressItems[0]?.classList.add('active');
    }
  }
}

class GlowMixMatch extends FoxSellMixMatch {
  constructor() {
    super();
    this.currentStep = 'items';
    this.continueButton = null;
    this.goBackButton = null;
    this.addToCartButton = null;
  }

  connectedCallback() {
    super.connectedCallback();

    this.continueButton = this.querySelector('.foxsell__continue-button');
    this.goBackButton = this.querySelector('.foxsell__go-back-button');
    this.addToCartButton = this.querySelector('.foxsell-add-to-cart-button');

    this.continueButton?.addEventListener('click', () => {
      this.currentStep = 'addons';
      this.toggleAddOnsCategory();
    });

    this.goBackButton?.addEventListener('click', () => {
      this.currentStep = 'items';
      this.toggleAddOnsCategory();
    });

    this.validateBundle();
  }

  toggleContinueButton() {
    if (!this.continueButton || !this.goBackButton) return;

    const isAddOnEnabled = this.bundle.addOns.enabled;
    const isItemsValid = this.bundle.isItemsValid;

    if (!isAddOnEnabled) {

      this.continueButton.classList.add('foxsell--hidden');
      this.goBackButton.classList.add('foxsell--hidden');
      this.addToCartButton?.classList.remove('foxsell--hidden');
    } else if (this.currentStep === 'items') {

      this.continueButton.classList.remove('foxsell--hidden');
      this.continueButton.toggleAttribute('disabled', !isItemsValid);
      this.goBackButton.classList.add('foxsell--hidden');
      this.addToCartButton?.classList.add('foxsell--hidden');
    } else {

      this.continueButton.classList.add('foxsell--hidden');
      this.goBackButton.classList.remove('foxsell--hidden');
      this.addToCartButton?.classList.remove('foxsell--hidden');
    }
  }

  toggleAddOnsCategory() {
    const showAddOns = this.currentStep === 'addons';
    const categories = this.querySelectorAll('.foxsell-category__item');

    categories.forEach(category => {
      const isAddOn = category.getAttribute('data-category') === '__add_ons__';
      category.classList.toggle('active', showAddOns === isAddOn);
    });

    this.toggleContinueButton();
  }

  getAddOnsConfig() {
    const defaultConfig = {
      addOnStrategy: '',
      allowedIds: [],
      enabled: false,
      minimum: 0,
      maximum: 0,
      selectedQuantity: 0,
      isMaxedOut: false
    };

    if (!this.config || !this.config.addOnProducts || !this.config.tiredDiscountConfig) {
      return defaultConfig;
    }

    const currentValidOption = this.getCurrentValidOption();
    if (!currentValidOption) {
      return defaultConfig;
    }

    const addOnStrategy = this.config.tiredDiscountConfig?.add_on_settings.strategy ?? '';

    const allowedIds = this.config.tiredDiscountConfig?.add_on_settings.product_tiers.find(
      tier => tier.title === currentValidOption.title
    )?.variants.map(variant => variant.id) ?? [];

    const minimum = currentValidOption?.add_on?.minimum ?? 0;
    const maximum = currentValidOption?.add_on?.maximum ?? 0;

    const isMaxedOut = this.getSelectedAddOns().reduce((sum, item) => sum + item.quantity, 0) >= maximum;
    const selectedQuantity = this.getSelectedAddOns().reduce((sum, item) => sum + item.quantity, 0);

    const enabled = allowedIds.length > 0;

    return { addOnStrategy, allowedIds, enabled, minimum, maximum, isMaxedOut, selectedQuantity };
  }

  validateAddOns() {
    if (!this.config) return false;
    if (this.config.addOnProducts?.length === 0) return true;

    const { addOnStrategy, allowedIds, maximum, enabled } = this.getAddOnsConfig();

    if(!enabled) {
      this.clearAddOns();
      return true;
    }
    //! If the add-on strategy is automatic add, add the add-ons that are allowed
    if(addOnStrategy === 'automatic_add') {
      this.autoAddAddOns();
      return true;
    }

    for(const addOn of this.getSelectedAddOns()) {
      if(!allowedIds.includes(addOn.product.id)) {
        this.removeFromAddOns(addOn, addOn.quantity, false);
      }
    }

    let totalQuantity = 0;
    for(const addOn of this.getSelectedAddOns()) {
      let _tempQuantity = totalQuantity + addOn.quantity;
      if(_tempQuantity > maximum) {
        this.removeFromAddOns(addOn, addOn.quantity, false);
      } else {
        totalQuantity += addOn.quantity;
      }
    }

    //! Send a refresh event to the bundle, to update the quantity and price
    //! - just in case the quantity is changed
    this.dispatchEvent(new CustomEvent(FOXSELL_EVENTS.bundleUpdated, {
      detail: {
        bundle: this.bundle,
        action: 'refresh',
      }
    }));

    const selectedAddOns = this.getSelectedAddOns();
    let { minimum: minimumAddOns, maximum: maximumAddOns } = this.getAddOnsConfig();
    let isValid = selectedAddOns.length >= minimumAddOns && selectedAddOns.length <= maximumAddOns;

    return isValid;
  }

  autoAddAddOns() {
    this.clearAddOns();

    this.config?.tiredDiscountConfig?.add_on_settings.product_tiers.forEach(tier=> {
      tier.variants.forEach(variant=> {
        const productId = variant.id;
        const product = this.querySelector(`foxsell-product-card[data-product-id="${productId}"][data-category="__add_ons__"]`);
        const currentVariant = product.variantSelector?.currentVariant;
        if(currentVariant) {
          this.selectedAddOns.set(currentVariant.id, {
            ...currentVariant,
            quantity: 1,
          });
        }
      });
    });

    this.dispatchEvent(new CustomEvent(FOXSELL_EVENTS.bundleUpdated, {
      detail: {
        bundle: this.bundle,
        action: 'refresh',
      }
    }));
  }

  validateBundleWithQAO() {
    if (!this.config || !this.config.options || !this.config.tiredDiscountConfig) {
      this.toggleAddToCartButton(true);
      return false;
    }

    //! [BUNDLE_CONFIG]
    //! Allow users to add more items than the max quantity
    const tiredDiscountConfig = this.config.tiredDiscountConfig;
    const allowIntermediateQuantity = tiredDiscountConfig.quantity_rules.strategy === 'any';
    const allowOverflow = tiredDiscountConfig.quantity_rules.max === 'no_cap';

    const optionLimits = (this.config.options || [])
      .map(opt => Number(opt.quantity ?? opt))
      .filter(n => !Number.isNaN(n));

    const maxQuantity = optionLimits.length ? Math.max(...optionLimits) : 0;
    const minQuantity = optionLimits.length ? Math.min(...optionLimits) : 0;

    const items = this.getSelectedItems().flatMap(category =>
      Array.isArray(category.items) ? category.items : []
    );

    const itemsCount = items.reduce((sum, item) => sum + item.quantity, 0);

    let isValid = false;

    if (allowIntermediateQuantity) {
      isValid = itemsCount >= minQuantity;
    } else {
      isValid = Array.isArray(this.config.options)
        && this.config.options.some(opt => Number(opt.quantity ?? opt) === itemsCount);
    }

    this.selectedItems.forEach(category => {
      category.isMaxQuantity = allowOverflow ? !allowOverflow : (itemsCount >= maxQuantity);
    });

    return isValid;
  }
}

const elements = [
  ['foxsell-mix-match', GlowMixMatch],
  ['foxsell-category-header', FoxSellCategoryHeader],
  ['foxsell-product-card', GlowProductCard],
  ['foxsell-bundle-summary', GlowBundleSummary],
  ['foxsell-bundle-line-item', FoxSellBundleLineItem],
  ['foxsell-bundle-progress', GlowBundleProgressBar],
  ['foxsell-variant-radio', FoxSellVariantRadio],
  ['foxsell-variant-select', FoxSellVariantSelect],
  ['foxsell-product-modal', FoxSellProductModal],
  ['foxsell-product-gallery', FoxSellProductGallery]
];

for (const [name, constructor] of elements) {
  if (!customElements.get(name)) customElements.define(name, constructor);
}
