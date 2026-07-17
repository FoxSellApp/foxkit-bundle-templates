'use strict';

const DEFAULT_ADDITIONAL_SETTINGS = {
  quantity_rules: {
    strategy: 'any',
    max: 'cap_at_highest',
  },
  add_on_settings: {
    strategy: 'add_on_step',
  },
};

const FOXSELL_EVENTS = {
  bundleUpdated: 'foxsell:bundle-updated'};

const emptyBundleState = {
  items: [],
  addOns: {
    addOnStrategy: '',
    enabled: false,
    minimum: 0,
    maximum: 0,
    selectedQuantity: 0,
    isMaximumQuantity: false,
    allowedIds: [],
    items: [],
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

const emptyAddOnsConfig = {
  addOnStrategy: 'add_on_step',
  allowedIds: [],
  enabled: false,
  minimum: 0,
  maximum: 0,
  selectedQuantity: 0,
  isMaximumQuantity: false,
};

class FoxSellCategoryHeader extends HTMLElement {
  constructor() {
    super();
    this.categoryId = this.getAttribute('data-category-id');
    this.quantityElement = this.querySelector('.foxsell-category__quantity');
    this.foxsell = this.closest('foxsell-mix-match');
    this._boundUpdateQuantity = this.updateQuantity.bind(this);
  }

  connectedCallback() {
    if (!this.foxsell) return;
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
    this.quantityElement.textContent = `(${category.quantity}/${category.maxQuantity})`;
  }

  updateAddOnQuantity(event) {
    const { bundle } = event.detail;
    if (!bundle) return;
    if (!this.quantityElement) return;
    this.quantityElement.textContent = `(${bundle.addOns.selectedQuantity}/${bundle.addOns.maximum})`;
  }
}

function resolveAdditionalSettings(settings) {
  return {
    ...settings,
    quantity_rules: {
      ...DEFAULT_ADDITIONAL_SETTINGS.quantity_rules,
      ...settings?.quantity_rules,
    },
    add_on_settings: {
      ...DEFAULT_ADDITIONAL_SETTINGS.add_on_settings,
      ...settings?.add_on_settings,
    },
  };
}

function getItemIdFromGid(gid) {
  return parseInt(gid.split('/').pop() ?? '0');
}

function getVariantPrice(variants, option) {
  if (!option?.variant_id || !option?.price) {
    return { price: 0, compareAtPrice: 0 };
  }
  const variant = variants.find((v) => v.id === parseInt(option.variant_id));
  if (!variant) {
    return { price: 0, compareAtPrice: 0 };
  }
  const price = (option.price.value ?? 0) * 100;
  const compareAtPrice = variant.compare_at_price ?? 0;
  return { price, compareAtPrice };
}

class FoxSellMixMatch extends HTMLElement {
  constructor() {
    super();
    this.selectedItems = new Map();
    this.selectedAddOns = new Map();
    this.selectedOption = {};

    this.config = this.getConfig();

    this.bundle = emptyBundleState;

    this.boundHandleOverlayClick = this.handleOverlayClick.bind(this);
  }

  connectedCallback() {
    this.validateBundle();

    this.querySelector('.foxsell-add-to-cart-button')?.classList.remove('foxsell--hidden');
    this.querySelector('.foxsell-mix-match__overlay')?.addEventListener('click', this.boundHandleOverlayClick);
  }

  disconnectedCallback() {
    this.querySelector('.foxsell-mix-match__overlay')?.removeEventListener('click', this.boundHandleOverlayClick);
  }

  getConfig() {
    const config = window.foxsell.config[this.dataset.bundleId ?? ''];
    if(!config) throw new Error('FoxSell Mix Match config not found');
    config.additionalSettings = resolveAdditionalSettings(config.additionalSettings);
    return config;
  }

  handleOverlayClick() {

    const modal = this.querySelector('#foxsell-product-dialog[data-modal]');
    if (modal?.hasAttribute('open')) {
       (this.querySelector('foxsell-product-modal'))?.closeModal();
    }
  }

  getCurrentPriceStrategy() {
    const settingsPrice = this.config.settings.price;
    const qaoEnabled = (this.config.options?.length ?? 0) > 0;
    if (!qaoEnabled) return settingsPrice;

    let value = 0;
    const currentValidOption = this.getCurrentValidOption();

    if(currentValidOption) {
      value = currentValidOption.price.value;
    }

    return {
      strategy: settingsPrice.strategy,
      value: value,
    };
  }

  getCurrentValidOption() {
    const items = this.getSelectedItems();
    const itemsCount = items.reduce((sum, item) => sum + item.quantity, 0);
    return this.config.options.findLast(opt => Number(opt.quantity ?? opt) <= itemsCount) ?? null;
  }

  buildBundle(isValid, isAddOnsValid, isItemsValid) {
    const qaoEnabled = (this.config.options?.length ?? 0) > 0;
    const items = this.getSelectedItems();
    const addOnItems = this.getSelectedAddOns();
    const { originalTotalPrice, totalPrice, totalDiscount } = this.getTotalPrice();
    const id = this.config.bundleId ? `${this.config.bundleId}_${Date.now()}` : '';
    const priceStrategy = this.getCurrentPriceStrategy();

    return {
      items,
      addOns: {
        ...this.getAddOnsConfig(),
        enabled: qaoEnabled ? this.getAddOnsConfig().enabled : isItemsValid,
        items: addOnItems,
      },
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

  getCategoryConfig(categoryId) {
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
    return Array.from(this.selectedItems.values()).flatMap(category => {
      const { items, ...categoryData } = category;
      return Array.from(items.values()).map(item => ({
        ...item,
        category: categoryData,
      }));
    });
  }

  getSelectedAddOns() {
    return Array.from(this.selectedAddOns.values());
  }

  addToBundle(item, quantity, categoryId, dispatchEvent = true) {
    const selectedCategory = this.getCategory(categoryId, true);
    if (!selectedCategory) return;

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
        foxsell_price: this.getItemPrice(item.id, categoryId, item.price),
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
        category: this.selectedItems.get(categoryId),
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
      ? { ...selectedCategory, isMaxQuantity: false }
      : null;

    if (selectedCategory.quantity <= 0) {
      this.selectedItems.delete(categoryId);
    }

    this.validateBundle();

    if (!dispatchEvent) return;
    const category = categoryForEvent ?? this.selectedItems.get(categoryId);
    this.dispatchEvent(new CustomEvent(FOXSELL_EVENTS.bundleUpdated, {
      detail: {
        bundle: this.bundle,
        action: 'remove',
        item: { ...selectedItem, quantity: newItemQuantity },
        category,
      }
    }));
  }

  clearBundle(dispatchEvent = true) {
    this.selectedItems.clear();
    this.validateBundle();
    if (!dispatchEvent) return;
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
        foxsell_price: this.getItemPrice(item.id, '__add_ons__', item.price),
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

  clearAddOns(dispatchEvent = true) {
    this.selectedAddOns.clear();
    if (!dispatchEvent) return;
    this.validateBundle();
    this.dispatchEvent(new CustomEvent(FOXSELL_EVENTS.bundleUpdated, {
      detail: {
        bundle: this.bundle,
        action: 'clear-addons',
      }
    }));
  }

  validateBundle() {
    const qaoEnabled = this.config.options.length > 0;
    const isItemsValid = qaoEnabled ? this.validateBundleWithQAO() : this.validateBundleWithoutQAO();
    const isAddOnsValid = this.validateAddOns(isItemsValid);

    const isValid = isItemsValid && isAddOnsValid;
    this.bundle = this.buildBundle(isValid, isAddOnsValid, isItemsValid);

    this.updateLineItemProperties();
    this.renderPrice();
    this.toggleAddToCartButton(!isValid);
  }

  validateAddOns(isItemsValid) {
    const { allowedIds, maximum, addOnStrategy } = this.getAddOnsConfig();

    if(addOnStrategy === 'automatic_add') {
      if(isItemsValid) {
        this.autoAddAddOns();
      }
      return true;
    }

    let selectedQuantity = 0;

    for (const selectedAddOn of this.getSelectedAddOns()) {
      const overMax = (selectedQuantity + selectedAddOn.quantity) > maximum;
      const notAllowed = !allowedIds.includes(selectedAddOn.product.id);

      if (notAllowed || overMax) {
        this.selectedAddOns.delete(selectedAddOn.id);
      } else {
        selectedAddOn.foxsell_price = this.getItemPrice(selectedAddOn.id, '__add_ons__', selectedAddOn.price);
        selectedQuantity += selectedAddOn.quantity;
      }
    }

    const selectedAddOns = this.getSelectedAddOns();
    let { minimum: minimumAddOns, maximum: maximumAddOns } = this.getAddOnsConfig();
    const selectedAddOnsQuantity = selectedAddOns.reduce((sum, item) => sum + item.quantity, 0);
    let isValid = selectedAddOnsQuantity >= minimumAddOns && selectedAddOnsQuantity <= maximumAddOns;

    return isValid;
  }

  autoAddAddOns() {
    const { allowedIds, maximum } = this.getAddOnsConfig();

    this.clearAddOns(false);

    let selectedQuantity = 0;
    for (const allowedId of allowedIds) {
      const item = this.config.addOnProducts.find(item => item.id === allowedId);
      if(!item) continue;

      const productGid = `gid://shopify/Product/${allowedId}`;
      const configuredVariantGids = Object.keys(this.config.addOnProductProperties[productGid]?.variants ?? {});
      const variant = item.variants.find(v => configuredVariantGids.includes(`gid://shopify/ProductVariant/${v.id}`)) ?? item.variants[0];

      if(variant) {
        this.selectedAddOns.set(variant.id, {
          ...variant,
          foxsell_price: this.getItemPrice(variant.id, '__add_ons__', variant.price),
          product: {
            ...item,
            featured_image: {
              src: item.featured_image,
              alt: item.title
            },
          },
          quantity: 1,
        });
        selectedQuantity = selectedQuantity + 1;
        if(selectedQuantity >= maximum) break;
      }
    }
  }

  getItemPrice(variantId, categoryId, fallbackPrice) {
    if (categoryId === '__add_ons__') {
      const product = this.config.addOnProducts.find(p => p.variants.some(v => v.id === variantId));
      if (!product) return fallbackPrice;

      const qaoEnabled = this.config.options.length > 0;
      if (qaoEnabled) {
        const currentValidOption = this.getCurrentValidOption();
        if (!currentValidOption) return fallbackPrice;

        const addOnEntry = currentValidOption.add_on_products.find(
          (addOn) => parseInt(addOn.id) === product.id
        );
        const value = addOnEntry?.variants[variantId] ?? addOnEntry?.variants[`gid://shopify/ProductVariant/${variantId}`];
        return value != null ? value * 100 : fallbackPrice;
      }

      const pid = `gid://shopify/Product/${product.id}`;
      const vid = `gid://shopify/ProductVariant/${variantId}`;
      const configuredValue = this.config.addOnProductProperties[pid]?.variants[vid];
      return configuredValue != null ? configuredValue * 100 : fallbackPrice;
    }

    const categoryConfig = this.getCategoryConfig(categoryId);
    if (!categoryConfig) return fallbackPrice;

    for (const item of categoryConfig.items) {
      const value = item.variants[variantId] ?? item.variants[`gid://shopify/ProductVariant/${variantId}`];
      if (value != null) return value * 100;
    }

    return fallbackPrice;
  }

  validateBundleWithQAO() {
    const quantityRules = this.config.additionalSettings.quantity_rules;
    const allowIntermediateQuantity = quantityRules.strategy === 'any';
    const allowOverflow = quantityRules.max === 'no_cap';

    const optionLimits = (this.config.options || [])
      .map(opt => Number(opt.quantity ?? opt))
      .filter(n => !Number.isNaN(n));

    const maxQuantity = optionLimits.length ? Math.max(...optionLimits) : 0;
    const minQuantity = optionLimits.length ? Math.min(...optionLimits) : 0;

    const items = this.getSelectedItems();

    const itemsCount = items.reduce((sum, item) => sum + item.quantity, 0);

    let isValid = false;

    if (allowIntermediateQuantity) {
      isValid = itemsCount >= minQuantity;
    } else {
      isValid = Array.isArray(this.config.options)
        && this.config.options.some(opt => Number(opt.quantity ?? opt) === itemsCount);
    }

    this.selectedItems.forEach(category => {
      category.isMaxQuantity = !allowOverflow && (itemsCount >= maxQuantity);
    });

    return isValid;
  }

  validateBundleWithoutQAO() {
    const isValid = this.config.categories.reduce((allValid, category) => {
      const isOptional = category.quantity === 0;

      if (isOptional) return allValid;
      const selectedCategory = this.getCategory(category.id);
      if (!selectedCategory) return false;
      const atMax = selectedCategory.quantity >= selectedCategory.maxQuantity;
      selectedCategory.isMaxQuantity = atMax;
      return allValid && atMax;
    }, true);

    return isValid;
  }

  getAddOnsConfig() {
    //! support add-on strategy: add_on_step, automatic_add
    const addOnStrategy = this.config.additionalSettings.add_on_settings.strategy;

    let allowedIds = [];

    let minimum = 0;
    let maximum = 0;

    if(this.config.options.length > 0) {
      const currentValidOption = this.getCurrentValidOption();
      if(!currentValidOption) return { ...emptyAddOnsConfig };
      minimum = currentValidOption.add_on.minimum ?? 0;
      maximum = currentValidOption.add_on.maximum ?? 0;
      allowedIds = currentValidOption.add_on_products.map((addOn)=> parseInt(addOn.id));
    } else {
      minimum = this.config.settings.addOn.minimum ?? 0;
      maximum = this.config.settings.addOn.maximum ?? 0;
      allowedIds = Object.keys(this.config.addOnProductProperties).map(key => getItemIdFromGid(key));
    }

    const isMaximumQuantity = this.getSelectedAddOns().reduce((sum, item) => sum + item.quantity, 0) >= maximum;
    const selectedQuantity = this.getSelectedAddOns().reduce((sum, item) => sum + item.quantity, 0);

    //! If the maximum is 0, we don't need to validate the add-ons
    if(maximum === 0) {
      allowedIds = [];
    }

    return {
      addOnStrategy: addOnStrategy,
      allowedIds: allowedIds,
      enabled: (allowedIds.length > 0 && maximum > 0),
      minimum,
      maximum,
      selectedQuantity,
      isMaximumQuantity
    };
  }

  updateLineItemProperties() {
    const bundleIdInput = this.querySelector('input[name="properties[__foxsell:dynamic_add_on_bundle_id]"]');
    const itemInput = this.querySelector('input[name="properties[__foxsell:dynamic_add_on_bundle_items]"]');
    const savingsInput = this.querySelector('input[name="properties[__foxsell:dynamic_add_on_bundle_savings]"]');
    const idInput = this.querySelector('input[name="id"]');

    if (!itemInput || !bundleIdInput) return;

    bundleIdInput.setAttribute('value', this.bundle.id);

    if (this.bundle.qaoEnabled) {
      const validOption = this.getCurrentValidOption();
      if (idInput) {
        idInput.setAttribute('value', validOption?.variant_id ?? '');
      }
    }

    const lineItems = this.bundle.items.map(item => ({
      variantId: Number(item.id) || item.id,
      quantity: item.quantity || 1,
      category: item.category.title,
      type: 'product',
      properties: item.properties || {}
    }));

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
    const itemsTotalPrice = this.getSelectedItems().reduce((sum, item) => {
      return sum + (item.foxsell_price ?? item.price) * item.quantity;
    }, 0);

    const addOnsTotalPrice = this.getSelectedAddOns().reduce((sum, item) => {
      return sum + (item.foxsell_price ?? item.price) * item.quantity;
    }, 0);

    let discountValue = 0;
    let totalDiscount = 0;
    let originalTotalPrice = 0;
    let totalPrice = 0;

    const priceStrategy = this.config.settings.price.strategy;
    const qaoEnabled = this.config.options.length > 0;

    if(priceStrategy === 'dynamic_pricing') {
      originalTotalPrice = itemsTotalPrice + addOnsTotalPrice;
      if(qaoEnabled) {
        const validOption = this.getCurrentValidOption();
        if(validOption) {
          discountValue = validOption.price.value;
        }
      } else {
        discountValue = this.config.settings.price.value;
      }
      totalDiscount = (discountValue / 100) * itemsTotalPrice;
      totalPrice = (itemsTotalPrice - totalDiscount) + addOnsTotalPrice;
    } else {
      if(qaoEnabled) {
        const validOption = this.getCurrentValidOption() ?? this.config.options[0];
        if(validOption) {
          const { price, compareAtPrice } = getVariantPrice(this.config.variants, validOption);
          totalPrice = price + addOnsTotalPrice;
          originalTotalPrice = compareAtPrice + addOnsTotalPrice;
          totalDiscount = Math.max(originalTotalPrice - totalPrice, 0);
        }
      } else {
        totalPrice = (this.config.settings.price.value * 100) + addOnsTotalPrice;
        originalTotalPrice = (this.config.variants[0]?.compare_at_price ?? 0) + addOnsTotalPrice;
        totalDiscount = Math.max(originalTotalPrice - totalPrice, 0);
      }
    }

    return {
      originalTotalPrice,
      totalPrice,
      totalDiscount,
      discountValue,
      priceStrategy,
      itemsTotalPrice,
      addOnsTotalPrice
    };
  }

  renderPrice() {
    const addToCartButton = this.querySelector('button[type="submit"]');
    if (!addToCartButton) return;

    if (!this.initialAddToCartButtonHTML) {
      this.initialAddToCartButtonHTML = addToCartButton.innerHTML;
    }

    const { originalTotalPrice, totalPrice } = this.bundle;
    if (originalTotalPrice > totalPrice) {
      addToCartButton.innerHTML = `${this.initialAddToCartButtonHTML} -
      <span class="foxsell-compare-at-price">${window.foxsell?.formatMoney?.(originalTotalPrice)}</span>
      <span class="foxsell-sale-price">${window.foxsell?.formatMoney?.(totalPrice)}</span>`;
    } else {
      addToCartButton.innerHTML = `${this.initialAddToCartButtonHTML} -
      <span class="foxsell-sale-price">${window.foxsell?.formatMoney?.(totalPrice)}</span>`;
    }
  }

  toggleAddToCartButton(disable) {
    const addToCartButton = this.querySelector('button[type="submit"]');
    if (!addToCartButton) return;
    addToCartButton.toggleAttribute('disabled', disable);
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
    this.isAddOnCard = this.categoryId === '__add_ons__';

    if (this.isAddOnCard) {
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
    this.updateQuantity(this.getCurrentQuantity());

    if (!this.variantSelector?.currentVariant) {
      this.disableAddToBundle = true;
      this.toggleAddToBundleButton(true);
      return;
    }

    let disable;
    if (this.categoryId === '__add_ons__') {
      const bundle = this.foxsell?.bundle;
      if (!bundle) {
        disable = true;
      } else {
        const { enabled, allowedIds, isMaximumQuantity } = bundle.addOns;
        const isAllowed = allowedIds.includes(this.variantSelector.product?.id ?? 0);
        disable = !enabled || !isAllowed || isMaximumQuantity || this.isCurrentVariantAtInventoryLimit();
      }
    } else {
      const category = this.foxsell?.getCategory(this.categoryId ?? '');
      disable = (category?.isMaxQuantity ?? false) || this.isCurrentVariantAtInventoryLimit();
    }

    this.disableAddToBundle = disable;
    this.toggleAddToBundleButton(disable);
  }

  handleBundleUpdated(event) {
    if (event.detail.action === 'clear') {
      this.updateQuantity(0);
      const atInventoryLimit = this.isCurrentVariantAtInventoryLimit();
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

    const { category } = event.detail;
    const disableAddToBundle = category.isMaxQuantity;

    if (!qaoEnabled && this.categoryId !== category.id) return;

    this.disableAddToBundle = disableAddToBundle || this.isCurrentVariantAtInventoryLimit();
    this.toggleAddToBundleButton(this.disableAddToBundle);

    if (qaoEnabled) this.updatePrice();
    this.updateQuantity(this.getCurrentQuantity());
  }

  handleAddOnUpdated(event) {
    const { action } = event.detail;

    if (action === 'clear-addons') {
      this.updateQuantity(0);
      return;
    }

    if (action === 'refresh') {
      this.updateQuantity(this.getCurrentQuantity());
      return;
    }

    const { item, bundle } = event.detail;
    if (!item || !bundle) return;

    const { enabled, allowedIds, isMaximumQuantity } = bundle.addOns;

    const isAllowed = allowedIds.includes(this.variantSelector?.product?.id ?? 0);

    if (isAllowed) {
      this.classList.add('active');
    } else {
      this.classList.remove('active');
    }

    const disableAddToBundle = !enabled || !isAllowed || isMaximumQuantity;

    this.disableAddToBundle = disableAddToBundle || this.isCurrentVariantAtInventoryLimit();
    this.toggleAddToBundleButton(this.disableAddToBundle);
    this.updatePrice();
    this.updateQuantity(this.getCurrentQuantity());
  }

  getCurrentQuantity() {
    const variantId = this.variantSelector?.currentVariant?.id;
    if (variantId === undefined || variantId === null || !this.foxsell?.bundle || !this.categoryId) return 0;

    if (this.categoryId === '__add_ons__') {
      const addOns = this.foxsell.bundle.addOns;
      if (!addOns || !addOns.items) return 0;
      return addOns.items.find((item) => item.id === variantId)?.quantity ?? 0;
    }

    return this.foxsell.bundle.items
      .find(item => item.category.id === this.categoryId && item.id === variantId)
      ?.quantity ?? 0;
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
    if (!this.variantSelector || !this.foxsell || !this.foxsell.bundle || !this.categoryId) return;
    const priceEl = this.querySelector('.foxsell-product-card__price');
    if (!priceEl) return;

    const { currentVariant, product } = this.variantSelector;
    if (!currentVariant) return;

    const fallbackPrice = currentVariant.price ?? currentVariant.product?.price ?? product?.price ?? 0;
    let price = this.foxsell.getItemPrice(currentVariant.id, this.categoryId, fallbackPrice);
    let discountedPrice = price;
    const priceStrategy = this.foxsell.bundle.priceStrategy;
    if (!this.isAddOnCard && priceStrategy && priceStrategy.strategy === 'dynamic_pricing') {
      const discount = priceStrategy.value;
      discountedPrice = price - (price * (discount / 100));
    }

    if (price > discountedPrice) {
      priceEl.innerHTML = `
      <span class="foxsell-sale-price">${window.foxsell?.formatMoney?.(discountedPrice)}</span>
      <span class="foxsell-compare-at-price">${window.foxsell?.formatMoney?.(price)}</span>`;
    } else {
      priceEl.innerHTML = `<span class="foxsell-sale-price">${this.isAddOnCard && price === 0 ? 'Free' : window.foxsell?.formatMoney?.(price)}</span>`;
    }
  }

  updateQuantity(quantity) {
    const el = this.querySelector('.foxsell-quantity');
    if (el) el.textContent = String(quantity);
  }

  isCurrentVariantAtInventoryLimit() {
    const variant = this.variantSelector?.currentVariant;
    if (!variant || !this.foxsell || !this.categoryId) return true;
    if (!variant.inventory_management || variant.inventory_policy === 'continue') return false;
    return this.getCurrentQuantity() >= variant.inventory_quantity;
  }

  addToBundle() {
    if (!this.variantSelector || !this.variantSelector.currentVariant || !this.foxsell || !this.categoryId) return;
    if (this.categoryId === '__add_ons__') {

      this.foxsell.addToAddOns(this.variantSelector.currentVariant, 1);
      if (this.isCurrentVariantAtInventoryLimit()) {
        this.toggleAddToBundleButton(true);
      }
    } else {
      this.foxsell.addToBundle(this.variantSelector.currentVariant, 1, this.categoryId);
      if (this.isCurrentVariantAtInventoryLimit()) {
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
  updateOptions() {
    this.options = [...this.querySelectorAll('fieldset')].map(fs => {
      const select = fs.querySelector('select');
      if (select) return select.value;
      return fs.querySelector('input:checked')?.getAttribute('value') ?? '';
    });
  }
}

class ReserveFoxSellProductCard extends FoxSellProductCard {

  updateQuantity(quantity) {
    super.updateQuantity(quantity);
    this.classList.toggle('item-in-bundle', quantity > 0);
  }
}

class FoxSellProductForm extends HTMLElement {

  constructor() {
    super();
    this.errorMessages = {
      cartAddFailed: "There was an error adding the item to the cart",
      outOfStock: "Some of the items are out of stock",
    };
  }

  connectedCallback() {
    this.addEventListener('submit', this.handleSubmit);
  }

  disconnectedCallback() {
    this.removeEventListener('submit', this.handleSubmit);
  }

  getLineAttributes(formData) {
    const attributes = [];
    for (const [name, value] of formData.entries()) {
      const match = name.match(/^properties\[(.+)\]$/);
      const key = match?.[1];
      if (!key || value === '') continue;
      attributes.push({ key, value: value });
    }
    return attributes;
  }

  showError(error) {
    const errorElement =  (this.querySelector('.foxsell-product-form__error'));
    if (errorElement) {
      errorElement.textContent = error.message;
      errorElement.classList.add('active');
    }
  }

  clearError() {
    const errorElement =  (this.querySelector('.foxsell-product-form__error'));
    if (errorElement) {
      errorElement.textContent = '';
      errorElement.classList.remove('active');
    }
  }

  async handleSubmit(event) {
    event.preventDefault();
    this.clearError();

    const form = event.target;
    if(!(form instanceof HTMLFormElement)) return;

    const submitButton =  (form.querySelector('button[type="submit"]'));
    if (submitButton) submitButton.disabled = true;

    const formData = new FormData( (form));

    if (!window.Shopify.actions.updateCart.isDefault()) {
      try {
        const result = await window.Shopify.actions.updateCart({
          lines: [{
            merchandiseId: `gid://shopify/ProductVariant/${formData.get("id")}`,
            quantity: parseInt(String(formData.get('quantity') ?? '1'), 10),
            attributes: this.getLineAttributes(formData)
          }]
        });

        if(result.warnings?.length || result.userErrors?.length) {
          const warnings =  (result.warnings) || [];
          const userErrors =  (result.userErrors) || [];

          if(userErrors.length) {
            throw new Error(this.errorMessages.cartAddFailed);
          }

          const warning = warnings.find((warning) => {
            return (warning.code === "MERCHANDISE_OUT_OF_STOCK" || warning.code === "MERCHANDISE_NOT_ENOUGH_STOCK");
          });

          if (warning) {
            throw new Error(this.errorMessages.outOfStock);
          }
        }
        await window.Shopify.actions.openCart();
      } catch (error) {
        this.showError( (error));
      }
      finally {
        if (submitButton) submitButton.disabled = false;
      }
    } else {
      this.formSubmit(formData);
    }
  }

  async formSubmit(formData) {
    const properties = Object.fromEntries(
      this.getLineAttributes(formData).map(({ key, value }) => [key, value])
    );

    const body = {
      items: [{
        id: formData.get("id"),
        quantity: parseInt(String(formData.get('quantity') ?? '1'), 10),
        properties,
      }]
    };

    try {
      const result = await fetch(window.Shopify.routes.root + 'cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if(result.ok) {
        window.location.href = window.Shopify.routes.root + 'cart';
      } else {
        const data = await result.json();
        if(data.status === 422) {
          throw new Error(this.errorMessages.outOfStock);
        }
        throw new Error(data.message);
      }
    } catch (error) {
      this.showError( (error));
    }
  }
}

class ReserveCategoryPreview extends HTMLElement {
  constructor() {
    super();
    this.categoryId = this.getAttribute('data-category-id');
    this.boundHandleBundleUpdate = this.handleBundleUpdate.bind(this);

    this.foxsell = this.closest('foxsell-mix-match');
  }

  connectedCallback() {
    if (!this.foxsell) return;
    this.foxsell.addEventListener(FOXSELL_EVENTS.bundleUpdated, this.boundHandleBundleUpdate);
  }

  disconnectedCallback() {
    if (!this.foxsell) return;
    this.foxsell.removeEventListener(FOXSELL_EVENTS.bundleUpdated, this.boundHandleBundleUpdate);
  }

  handleBundleUpdate() {
    if (!this.foxsell || !this.categoryId) return;
    let item = null;

    if(this.categoryId === '__add_ons__') {
      item = this.foxsell.bundle.addOns.items[0];
    } else {
      item = this.foxsell.bundle.items.find(item => item.category.id === this.categoryId);
    }

    if(item) {
      const previewImageContainer = this.querySelector('.foxsell-category__preview-image');
      const previewProductInfoContainer = this.querySelector('.foxsell-category__preview-info, .foxsell-product-card__info');

      let itemImage = item.featured_image?.src ?? item.product.featured_image;
      if(previewImageContainer && itemImage) {
        const previewImage = document.createElement('img');
        const separator = itemImage.includes('?') ? '&' : '?';
        itemImage = itemImage + separator + 'width=150';
        previewImage.src = itemImage;
        previewImageContainer.replaceChildren(previewImage);
      }

      let itemPrice = item.foxsell_price;
      let discountedPrice = item.foxsell_price;
      let discount = 0;
      if (!this.foxsell || !this.foxsell.config || !this.foxsell.bundle) return '';
      const priceStrategy = this.foxsell.bundle.priceStrategy;

      //! Only apply price strategy to items, not add-ons
      if (this.categoryId !== '__add_ons__') {
        if (priceStrategy && priceStrategy.strategy === 'dynamic_pricing') {
          discount = priceStrategy.value;
          discountedPrice = item.foxsell_price - (item.foxsell_price * (discount / 100));
        }
      }

      if(previewProductInfoContainer) {
        const previewHTML = `
        <div class="foxsell-product-card__info">
          <div class="foxsell-product-card__title">${item.product.title}</div>
          ${item.option1 !== 'Default Title' ?
          `<div class="foxsell-product-card__variant-title">${item.options.join(", ")}</div>`
          : ''}
          ${(this.categoryId === '__add_ons__' || priceStrategy?.strategy === 'dynamic_pricing') ?
            `
            <div>
              ${itemPrice > discountedPrice ? `
                <div>
                  <span class="foxsell-sale-price">${window.foxsell?.formatMoney?.(discountedPrice)}</span>
                  <span class="foxsell-compare-at-price">${window.foxsell?.formatMoney?.(itemPrice)}</span>
                </div>`
                :
                `<div>
                  <span class="foxsell-sale-price">${this.categoryId === '__add_ons__' && itemPrice === 0 ? (this.foxsell?.config?.locale?.freeLabel ?? 'Free') : window.foxsell?.formatMoney?.(itemPrice)}</span>
                </div>`
              }
            </div>
          ` : ''}
        </div>
        `;

        previewProductInfoContainer.classList.replace('foxsell-category__preview-info', 'foxsell-product-card__info');
        previewProductInfoContainer.innerHTML = previewHTML;
      }
    }
  }
}

function closeCategoryDropdown(element) {
  const details = element?.closest('details.foxsell-category__dropdown');
  if (details instanceof HTMLDetailsElement) {
    details.open = false;
  }
}

function closeAllCategoryDropdowns(root, keepOpen = null) {
  root.querySelectorAll('details.foxsell-category__dropdown').forEach((details) => {
    if (details !== keepOpen) {
       (details).open = false;
    }
  });
}

class ReserveFoxSellVariantCard extends HTMLElement {
  constructor() {
    super();

    this.foxsell = this.closest('foxsell-mix-match');

    this.categoryId = this.getAttribute('data-category') ?? '';
    this.boundHandleClick = this.handleVariantChange.bind(this);
    this.boundHandleBundleUpdated = this.handleBundleUpdated.bind(this);
  }

  connectedCallback() {
    this.addEventListener('click', this.boundHandleClick);
    this.handleBundleUpdated();
    if(this.foxsell) {
      this.foxsell.addEventListener(FOXSELL_EVENTS.bundleUpdated, this.boundHandleBundleUpdated);
    }
    this.autoAddToBundle();
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.boundHandleClick);
    if(this.foxsell) {
      this.foxsell.removeEventListener(FOXSELL_EVENTS.bundleUpdated, this.boundHandleBundleUpdated);
    }
  }

  handleBundleUpdated() {
    this.updateVariantData();
    this.updatePrice();
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

  syncProductsWithBundle() {
    if (!this.foxsell || !this.categoryId) return;

    if(this.categoryId === '__add_ons__') {
      this.foxsell.clearAddOns(false);
    } else {
      const category = this.foxsell.getCategory(this.categoryId);
      if (category) {
        for (const item of [...category.items.values()]) {
          this.foxsell.removeFromBundle(item, item.quantity, this.categoryId, false);
        }
      }
    }

    this.addToBundle();
  }

  updatePrice() {
    if (!this.foxsell) return;
    const priceEl = this.querySelector('.foxsell-product-card__price');
    if (!priceEl) return;

    const currentVariant = this.item;
    const product = currentVariant.product;
    let price = currentVariant?.foxsell_price ?? currentVariant?.product?.price ?? product?.price ?? 0;
    let discountedPrice = price;
    const priceStrategy = this.foxsell.bundle.priceStrategy;
    if (this.categoryId !== '__add_ons__' && priceStrategy && priceStrategy.strategy === 'dynamic_pricing') {
      const discount = priceStrategy.value;
      discountedPrice = price - (price * (discount / 100));
    }

    if (price > discountedPrice) {
      priceEl.innerHTML = `
      <span class="foxsell-sale-price">${window.foxsell?.formatMoney?.(discountedPrice)}</span>
      <span class="foxsell-compare-at-price">${window.foxsell?.formatMoney?.(price)}</span>`;
    } else {
      const isAddOnCard = this.categoryId === '__add_ons__';
      const freeLabel = this.foxsell?.config?.locale?.freeLabel ?? 'Free';
      priceEl.innerHTML = `<span class="foxsell-sale-price">${isAddOnCard && price === 0 ? freeLabel : window.foxsell?.formatMoney?.(price)}</span>`;
    }
  }

  addToBundle() {
    if (!this.foxsell || !this.item) return;
    const quantity = parseInt(this.getAttribute('data-quantity') || '1');
    if (this.categoryId === '__add_ons__') {
      this.foxsell.addToAddOns(this.item, quantity);
    } else {
      this.foxsell.addToBundle(this.item, quantity, this.categoryId);
    }
  }

  handleVariantChange() {
    this.updateVariantData();
    this.syncProductsWithBundle();
    closeCategoryDropdown(this);
  }

  autoAddToBundle() {
    if (this.dataset.autoAdd !== 'true' || !this.foxsell || !this.item) return;
    if (this.foxsell.getItem(this.item.id, this.categoryId)) return;

    this.addToBundle();
  }

  updateVariantData() {
    try {
      const parsed = JSON.parse(this.querySelector('[type="application/json"]')?.textContent || '{}');
      this.item = {
        ...parsed.variant,
        product: parsed.product,
        foxsell_price: this.getFoxSellPrice(parsed.allowed_variants, parsed.variant.id)
      };
    } catch (error) {
      console.error('Error updating variant data', error);
    }
  }
}

class ReserveFoxSellMixMatch extends FoxSellMixMatch {
  constructor() {
    super();
    this.boundHandleDropdownToggle = this.handleDropdownToggle.bind(this);
    this.boundHandleDocumentClick = this.handleDocumentClick.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.querySelectorAll('details.foxsell-category__dropdown').forEach((details) => {
      details.addEventListener('toggle', this.boundHandleDropdownToggle);
    });
    document.addEventListener('click', this.boundHandleDocumentClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.querySelectorAll('details.foxsell-category__dropdown').forEach((details) => {
      details.removeEventListener('toggle', this.boundHandleDropdownToggle);
    });
    document.removeEventListener('click', this.boundHandleDocumentClick);
  }

  handleDropdownToggle(event) {
    const details =  (event.currentTarget);
    if (!details.open) return;

    closeAllCategoryDropdowns(this, details);
  }

  handleDocumentClick(event) {
    if (!this.querySelector('details.foxsell-category__dropdown[open]')) return;

    const target = event.target;
    if (!(target instanceof Node)) return;

    const clickedInsideDropdown = Array.from(
      this.querySelectorAll('details.foxsell-category__dropdown')
    ).some((details) => details.contains(target));

    if (!clickedInsideDropdown) {
      closeAllCategoryDropdowns(this);
    }
  }

  updateLineItemProperties() {
    const lineItems = this.bundle.items.map(item => ({
      variantId: Number(item.id) || item.id,
      quantity: item.quantity || 1,
      category: item.category.title,
      type: 'product',
      properties: item.properties || {}
    }));

    const addOnLineItems = this.bundle.addOns.items.map(item => ({
      variantId: Number(item.id) || item.id,
      quantity: item.quantity || 1,
      category: '',
      type: 'addOns',
      properties: item.properties || {}
    }));

    lineItems.push(...addOnLineItems);

    const requiredInputs = [
      {
        name: 'properties[__foxsell:dynamic_add_on_bundle_items]',
        value: JSON.stringify(lineItems)
      },
      {
        name: 'properties[__foxsell:dynamic_add_on_bundle_id]',
        value: this.bundle.id
      },
      {
        name: 'properties[__foxsell:dynamic_add_on_bundle_savings]',
        value: window.foxsell?.formatMoney?.(this.bundle.totalDiscount)
      }
    ];

    const section = this.closest('.shopify-section');
    if(section) {
      const form = section.querySelector('form[action*="cart/Add" i]');
      if(form) {
        const bundleIdInput = form.querySelector('input[name="properties[__foxsell:dynamic_add_on_bundle_id]"]');
        const itemInput = form.querySelector('input[name="properties[__foxsell:dynamic_add_on_bundle_items]"]');
        const savingsInput = form.querySelector('input[name="properties[__foxsell:dynamic_add_on_bundle_savings]"]');
        const idInput = form.querySelector('input[name="id"]');

        if(bundleIdInput) {
          bundleIdInput.setAttribute('value', this.bundle.id);
          itemInput?.setAttribute('value', JSON.stringify(lineItems));
          savingsInput?.setAttribute('value', window.foxsell?.formatMoney?.(this.bundle.totalDiscount));
        } else {
          for(const input of requiredInputs) {
            const newInput = document.createElement('input');
            newInput.setAttribute('name', input.name);
            newInput.setAttribute('value', input.value);
            newInput.setAttribute('type', 'hidden');
            newInput.setAttribute('data-foxsell-mix-match', 'true');
            form.appendChild(newInput);
          }

          //! Set the variant id input if QAO is enabled
          const variantIdInput = form.querySelector('input[name="id"]');
          if (this.bundle.qaoEnabled) {
            const validOption = this.getCurrentValidOption();
            if (variantIdInput) {
              variantIdInput.setAttribute('value', validOption?.variant_id ?? '');
            }
          }
        }

        //! Set the variant id input if QAO is enabled
        if (this.bundle.qaoEnabled && idInput) {
          const validOption = this.getCurrentValidOption();
          idInput.setAttribute('value', validOption?.variant_id ?? '');
        }
      }
    }
  }

  toggleAddToCartButton(disable) {
    const section = this.closest('.shopify-section');
    if(section) {
      const form = section.querySelector('form[action*="cart/Add" i]');
      if(form) {
        const addToCartButton = form.querySelector('button[type="submit"]');
        if (addToCartButton) {
          addToCartButton.toggleAttribute('disabled', disable);
        }
      }
    }
  }

  renderPrice() {
    const priceContainer = this.querySelector('.foxsell-mix-match__price-container');
    if(!priceContainer) return;

    const { originalTotalPrice, totalPrice, priceStrategy } = this.bundle;
    const discount = priceStrategy?.value || 0;
    const discountLabel = this.config?.locale.discountLabel.replaceAll("_discount", String(discount));
    if (originalTotalPrice > totalPrice) {
      priceContainer.innerHTML =
      `<span class="foxsell-sale-price">${window.foxsell?.formatMoney?.(totalPrice)}</span>
      <span class="foxsell-compare-at-price">${window.foxsell?.formatMoney?.(originalTotalPrice)}</span>
      ${ priceStrategy?.strategy === "dynamic_pricing" && discount > 0 ?
        `<span class="foxsell-discount">${discountLabel}</span>`
        : ''
      }
      `;
    } else {
      priceContainer.innerHTML = `<span class="foxsell-sale-price">${window.foxsell?.formatMoney?.(totalPrice)}</span>`;
    }
  }
}

const elements = [
  ['foxsell-mix-match', ReserveFoxSellMixMatch],
  ['foxsell-category-header', FoxSellCategoryHeader],
  ['foxsell-product-card', ReserveFoxSellProductCard],
  ['foxsell-variant-radio', FoxSellVariantRadio],
  ['foxsell-variant-select', FoxSellVariantSelect],
  ['foxsell-product-form', FoxSellProductForm],
  ['foxsell-category-preview', ReserveCategoryPreview],
  ['foxsell-variant-card', ReserveFoxSellVariantCard]
];

const overrides = window.foxsell?.overrides ?? {};

for (const [name, constructor] of elements) {
  if (customElements.get(name)) continue;
  const factory = overrides[name];
  customElements.define(name, factory ? factory(constructor) : constructor);
}
