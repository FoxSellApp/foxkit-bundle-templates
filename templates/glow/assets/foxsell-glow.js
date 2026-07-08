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

const emptyTotalPrice = {
  originalTotalPrice: 0,
  totalPrice: 0,
  totalDiscount: 0,
  discountValue: 0,
  priceStrategy: 'dynamic_pricing',
  itemsTotalPrice: 0,
  addOnsTotalPrice: 0,
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

const DELETE_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
`;

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

let bodyScrollLockDepth = 0;

let bodyScrollLockY = 0;

function lockBodyScroll() {
  if (bodyScrollLockDepth === 0) {
    bodyScrollLockY = window.scrollY;
    const body = document.body;
    body.style.position = 'fixed';
    body.style.top = `-${bodyScrollLockY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.overflow = 'hidden';
  }
  bodyScrollLockDepth += 1;
}

function unlockBodyScroll() {
  if (bodyScrollLockDepth === 0) return;
  bodyScrollLockDepth -= 1;
  if (bodyScrollLockDepth > 0) return;
  const body = document.body;
  body.style.position = '';
  body.style.top = '';
  body.style.left = '';
  body.style.right = '';
  body.style.overflow = '';
  window.scrollTo(0, bodyScrollLockY);
}

function getItemIdFromGid(gid) {
  return parseInt(gid.split('/').pop() ?? '0');
}

function getAddOnPrice(productId, variantId, addOnProductProperties) {
  let pid = `gid://shopify/Product/${productId}`;
  let vid = `gid://shopify/ProductVariant/${variantId}`;
  let addOnProperty = addOnProductProperties[pid]?.variants[vid];
  if(!addOnProperty) return 0;
  return addOnProperty * 100;
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

    this.config = null;

    this.bundle = emptyBundleState;

    const config = window.foxsell.config[this.dataset.bundleId ?? ''];
    if (config) config.additionalSettings = resolveAdditionalSettings(config.additionalSettings);
    this.config = config ?? null;
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

  handleOverlayClick() {

    const modal = this.querySelector('#foxsell-product-dialog[data-modal]');
    if (modal?.hasAttribute('open')) {
       (this.querySelector('foxsell-product-modal'))?.closeModal();
      return;
    }

    const summaryToggle =  (this.querySelector('#foxsell-bundle-summary-toggle'));
    if (summaryToggle?.getAttribute('aria-expanded') === 'true') {
      summaryToggle.click();
    }
  }

  getCurrentPriceStrategy() {
    if (!this.config) return null;
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
    if (!this.config || !this.config.options?.length) return null;

    const items = this.getSelectedItems();
    const itemsCount = items.reduce((sum, item) => sum + item.quantity, 0);
    return this.config.options.findLast(opt => Number(opt.quantity ?? opt) <= itemsCount) ?? null;
  }

  buildBundle(isValid, isAddOnsValid, isItemsValid) {
    if (!this.config) return { ...emptyBundleState };

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
    if (!this.config) return;
    const qaoEnabled = this.config.options?.length > 0;
    const isItemsValid = qaoEnabled ? this.validateBundleWithQAO() : this.validateBundleWithoutQAO();
    const isAddOnsValid = this.validateAddOns(isItemsValid);

    const isValid = isItemsValid && isAddOnsValid;
    this.bundle = this.buildBundle(isValid, isAddOnsValid, isItemsValid);

    this.updateLineItemProperties();
    this.renderPrice();
    this.toggleAddToCartButton(!isValid);
  }

  validateAddOns(isItemsValid) {
    if (!this.config) return false;
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
    if(!this.config) return;
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
          foxsell_price: getAddOnPrice(item.id, variant.id, this.config.addOnProductProperties),
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

  validateBundleWithQAO() {
    if (!this.config || !this.config.options) {
      this.toggleAddToCartButton(true);
      return false;
    }

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
    if (!this.config || !this.config.categories) {
      this.toggleAddToCartButton(true);
      return false;
    }

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
    if(!this.config) return { ...emptyAddOnsConfig };
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

    if (!itemInput || !bundleIdInput || !this.config?.bundleId) return;

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
    if (!this.config) return { ...emptyTotalPrice };

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

class GlowMixMatch extends FoxSellMixMatch {

  constructor() {
    super();
    this.currentView = 'items';

    this._lastValidOptionId = null;

    this.boundToggleToItems = this.toggleToItems.bind(this);
    this.boundToggleToAddOns = this.toggleToAddOns.bind(this);

    this.addToCartButton = this.querySelector('.foxsell-add-to-cart-button');

    this.continueButton = this.querySelector('#foxsell--continue-button');

    this.returnButton = this.querySelector('#foxsell--return-button');
  }

  connectedCallback() {
    this.validateBundle();

    this.querySelector('.foxsell-add-to-cart-button')?.classList.remove('foxsell--hidden');
    this.querySelector('.foxsell-mix-match__overlay')?.addEventListener('click', this.boundHandleOverlayClick);
    this.returnButton?.addEventListener('click', this.boundToggleToItems);
    this.continueButton?.addEventListener('click', this.boundToggleToAddOns);
  }

  disconnectedCallback() {
    this.querySelector('.foxsell-mix-match__overlay')?.removeEventListener('click', this.boundHandleOverlayClick);
    this.returnButton?.removeEventListener('click', this.boundToggleToItems);
    this.continueButton?.removeEventListener('click', this.boundToggleToAddOns);
  }

  validateBundle() {
    super.validateBundle();
    if(this.continueButton && this.returnButton) {
      this.toggleContinueButton();
    }
  }

  validateAddOns(isItemsValid) {
    const qaoEnabled = (this.config?.options?.length ?? 0) > 0;
    if (qaoEnabled) {
      const currentOption = this.getCurrentValidOption();
      const currentOptionId = currentOption?.variant_id ?? null;

      if (
        this._lastValidOptionId != null &&
        currentOptionId !== this._lastValidOptionId &&
        this.getSelectedAddOns().length > 0
      ) {
        this.clearAddOns(false);
      }
      this._lastValidOptionId = currentOptionId;
    }
    return super.validateAddOns(isItemsValid);
  }

  getAddOnPriceForCurrentTier(productId, variantId) {
    if (!this.config) return 0;

    if ((this.config.options?.length ?? 0) > 0) {
      const option = this.getCurrentValidOption();
      const tierAddon = option?.add_on_products?.find(
        (addon) => addon.id === String(productId)
      );
      const variants = tierAddon?.variants;
      if (!variants) return 0;

      const dollars =
        variants[variantId] ??
        variants[`gid://shopify/ProductVariant/${variantId}`];

      return dollars != null ? dollars * 100 : 0;
    }

    return getAddOnPrice(productId, variantId, this.config.addOnProductProperties);
  }

  getAutoAddOnVariant(allowedId, item) {
    if (!this.config) return undefined;

    if ((this.config.options?.length ?? 0) > 0) {
      const option = this.getCurrentValidOption();
      const tierAddon = option?.add_on_products?.find(
        (addon) => addon.id === String(allowedId)
      );
      if (tierAddon?.variants) {
        const tierVariantIds = Object.keys(tierAddon.variants).map((key) => {
          if (key.includes('ProductVariant/')) {
            return parseInt(key.split('/').pop() ?? '0', 10);
          }
          return parseInt(key, 10);
        });
        const variant = item.variants.find((v) => tierVariantIds.includes(v.id));
        if (variant) return variant;
      }
    }

    const productGid = `gid://shopify/Product/${allowedId}`;
    const configuredVariantGids = Object.keys(
      this.config.addOnProductProperties[productGid]?.variants ?? {}
    );
    return item.variants.find((v) =>
      configuredVariantGids.includes(`gid://shopify/ProductVariant/${v.id}`)
    ) ?? item.variants[0];
  }

  autoAddAddOns() {
    if (!this.config) return;
    const { allowedIds, maximum } = this.getAddOnsConfig();

    this.clearAddOns(false);

    let selectedQuantity = 0;
    for (const allowedId of allowedIds) {
      const item = this.config.addOnProducts.find((product) => product.id === allowedId);
      if (!item) continue;

      const variant = this.getAutoAddOnVariant(allowedId, item);
      if (!variant) continue;

      this.selectedAddOns.set(variant.id, {
        ...variant,
        foxsell_price: this.getAddOnPriceForCurrentTier(item.id, variant.id),
        product: {
          ...item,
          featured_image: {
            src: item.featured_image,
            alt: item.title,
          },
        },
        quantity: 1,
      });
      selectedQuantity += 1;
      if (selectedQuantity >= maximum) break;
    }
  }

  toggleContinueButton() {
    if(!this.config) return;

    const continueButtonWrapper = this.querySelector('.foxsell-mix-match__continue-buttons');
    const showContinueButton = this.bundle.addOns.enabled;

    continueButtonWrapper?.classList.toggle('foxsell--hidden', !showContinueButton);
    this.addToCartButton?.classList.toggle('foxsell--hidden', showContinueButton && this.currentView === 'items');

  }

  toggleToItems() {
    this.toggleView('items');
    this.scrollToMixMatchBlock();
  }

  toggleToAddOns() {
    this.toggleView('add_ons');
    this.scrollToMixMatchBlock();
  }

  scrollToMixMatchBlock() {
    const offset = Number(this.dataset.scrollOffset) || 85;
    const rect = this.getBoundingClientRect();
    if (rect.top >= offset && rect.top <= window.innerHeight) return;
    const top = rect.top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  toggleView(view) {
    this.currentView = view;
    const isItems = view === 'items';
    this.returnButton?.classList.toggle('foxsell--hidden', isItems);
    this.continueButton?.classList.toggle('foxsell--hidden', !isItems);
    this.addToCartButton?.classList.toggle('foxsell--hidden', isItems && this.bundle.addOns.enabled);

    const categoryNavigation = (this.querySelector('foxsell-category-navigation'));
    if (categoryNavigation) {
      if (isItems) {
        categoryNavigation.enableCategoryNavigation();
        categoryNavigation.toggleCategoryItemsVisibility();
      } else {
        categoryNavigation.disableCategoryNavigation();
      }
    }

    const categories = this.querySelectorAll('.foxsell-category__item');
    if (isItems && categoryNavigation) {
      categories.forEach(category => {
        if (category.dataset.category === '__add_ons__') {
          category.classList.add('foxsell--hidden');
        }
      });
    } else {
      categories.forEach(category => {
        const isAddOns = category.dataset.category === '__add_ons__';
        category.classList.toggle('foxsell--hidden', isItems ? isAddOns : !isAddOns);
      });
    }
  }
}

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

class FoxSellCategoryNavigation extends HTMLElement {
  constructor() {
    super();

    this.foxsell = this.closest('foxsell-mix-match');

    this.categoryItems = this.foxsell?.querySelectorAll('.foxsell-category__item') ?? [];

    this.categoryNavigationItems = this.querySelectorAll('.foxsell-mix-match__category-navigation-item');

    this.currentActiveCategoryId = 'all';
    this.boundHandleCategoryNavigationItemClick = this.handleCategoryNavigationItemClick.bind(this);
  }
  connectedCallback() {
    this.categoryNavigationItems.forEach(item => {
      item.addEventListener('click', this.boundHandleCategoryNavigationItemClick);
    });
  }

  disconnectedCallback() {
    this.categoryNavigationItems.forEach(item => {
      item.removeEventListener('click', this.boundHandleCategoryNavigationItemClick);
    });
  }

  handleCategoryNavigationItemClick(event) {
    event.preventDefault();
    const target = (event.currentTarget);

    if(!target) return;
    const currentActiveItem = Array.from(this.categoryNavigationItems).find(item => item.classList.contains('active'));
    if(currentActiveItem) {
      currentActiveItem.classList.remove('active');
    }

    target.classList.add('active');
    this.currentActiveCategoryId = target.dataset.categoryId ?? 'all';
    this.toggleCategoryItemsVisibility(this.currentActiveCategoryId);
  }

  toggleCategoryItemsVisibility(categoryId = this.currentActiveCategoryId) {
    if(categoryId === 'all') {
      this.categoryItems.forEach(item => {
        if (item.dataset.category === '__add_ons__') return;
        item.classList.remove('foxsell--hidden');
      });
    } else {
      this.categoryItems.forEach(item => {
        item.classList.toggle('foxsell--hidden', item.dataset.category !== categoryId);
      });
    }
  }

  disableCategoryNavigation() {
    this.categoryNavigationItems.forEach(item => {
      item.disabled = true;
    });
  }

  enableCategoryNavigation() {
    this.categoryNavigationItems.forEach(item => {
      item.disabled = false;
    });
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
      this.updatePrice();
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
    if (!this.variantSelector || !this.foxsell || !this.foxsell.bundle) return;
    const priceEl = this.querySelector('.foxsell-product-card__price');
    if (!priceEl) return;

    if(this.isAddOnCard) {
      this.variantSelector.variantData = undefined;
      this.variantSelector.getVariantData();
      this.variantSelector.updateMasterId();
    }

    const { currentVariant, product } = this.variantSelector;
    let price = currentVariant?.foxsell_price ?? currentVariant?.product?.price ?? product?.price ?? 0;
    let discountedPrice = price;
    const priceStrategy = this.foxsell.bundle.priceStrategy;
    if (!this.isAddOnCard && priceStrategy && priceStrategy.strategy === 'dynamic_pricing') {
      const discount = priceStrategy.value;
      discountedPrice = price - (price * (discount / 100));
    }

    if(price == 0) {
      price = currentVariant?.price ?? 0;
    }

    if (price > discountedPrice) {
      priceEl.innerHTML = `
      <span class="foxsell-sale-price">${window.foxsell?.formatMoney?.(discountedPrice)}</span>
      <span class="foxsell-compare-at-price">${window.foxsell?.formatMoney?.(price)}</span>`;
    } else {
      priceEl.innerHTML = `<span class="foxsell-sale-price">${window.foxsell?.formatMoney?.(price)}</span>`;
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

    this.foxsell = this.closest('foxsell-mix-match');

    this.isAddOnCard = this.getAttribute('data-add-on-product') === 'true';
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

      let allowed_variants = parsed.allowed_variants;
      if(this.foxsell && this.isAddOnCard) {
        const currentValidOption = this.foxsell.getCurrentValidOption();
        if(currentValidOption) {
          const currentValidAddon = currentValidOption.add_on_products.find(addon => addon.id === String(parsed.product.id));
          if(currentValidAddon) {
            allowed_variants = currentValidAddon.variants;
          }
        }
      }

      this.variantData = raw.map(v => ({
        ...v,
        product: parsed.product ?? null,
        foxsell_price: this.getFoxSellPrice(allowed_variants, v.id)
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

class GlowFoxSellProductCard extends FoxSellProductCard {

  updateQuantity(quantity) {
    super.updateQuantity(quantity);
    this.classList.toggle('item-in-bundle', quantity > 0);
  }
}

class FoxSellBundleSummary extends HTMLElement {
  constructor() {
    super();

    this.foxsell = this.closest('foxsell-mix-match');
    this.boundUpdateBundleSummary = this.updateBundleSummary.bind(this);
    this.boundTogglePanel = this.handleTogglePanel.bind(this);
  }

  connectedCallback() {
    if (this.foxsell) {
      this.foxsell.addEventListener(FOXSELL_EVENTS.bundleUpdated, this.boundUpdateBundleSummary);
    }

    this.toggleButton = this.querySelector('#foxsell-bundle-summary-toggle');
    if (this.toggleButton) {
      this.toggleButton.addEventListener('click', this.boundTogglePanel);
    }
  }

  disconnectedCallback() {
    if (this.foxsell) {
      this.foxsell.removeEventListener(FOXSELL_EVENTS.bundleUpdated, this.boundUpdateBundleSummary);
    }
    if (this.toggleButton) {
      this.toggleButton.removeEventListener('click', this.boundTogglePanel);
    }
    if (this.toggleButton?.getAttribute('aria-expanded') === 'true') {
      unlockBodyScroll();
    }
  }

  handleTogglePanel() {
    const btn = this.toggleButton;
    if (!btn) return;
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    if (expanded) {
      unlockBodyScroll();
    } else {
      lockBodyScroll();
    }
  }

  updateBundleSummary(event) {
    const { bundle } = event.detail;

    this.updateHeaderTotalQuantity(bundle);
    const bundleItemsContainer = this.querySelector('.foxsell-bundle-summary__items-list');
    if (!bundle || !bundleItemsContainer) return

    if (!this.emptyStateHTML) {
      this.emptyStateHTML = bundleItemsContainer.innerHTML;
    }

    const items = bundle.items;

    const addOnItems = bundle.addOns.items.map(item => ({
      ...item,
      category: {
        id: '__add_ons__',
        title: 'AddOns',
        quantity: bundle.addOns.selectedQuantity,
        maxQuantity: bundle.addOns.maximum,
        isMaxQuantity: bundle.addOns.isMaximumQuantity
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

  updateHeaderTotalQuantity(bundle) {
    const el = this.querySelector('[data-foxsell-total-quantity]');
    if (!el) return;
    if (!bundle) {
      el.textContent = '';
      return;
    }
    const { items, addOns } = bundle;
    let total = 0;
    for (let i = 0; i < items.length; i++) total += items[i].quantity;
    for (let i = 0; i < addOns.items.length; i++) total += addOns.items[i].quantity;
    el.textContent = `(${total})`;
  }

  //! DO NOT MODIFY THIS METHOD, extend the class to override this method

  renderLineItem(item) {
    let itemImage = item.featured_image ? item.featured_image.src : item.product.featured_image?.src;
    if (itemImage) {
      const separator = itemImage.includes('?') ? '&' : '?';
      itemImage = itemImage + separator + 'width=150';
    }
    let itemPrice = item.foxsell_price;
    let discountedPrice = item.foxsell_price;
    let discount = 0;
    if (!this.foxsell || !this.foxsell.config || !this.foxsell.bundle) return '';
    const priceStrategy = this.foxsell.bundle.priceStrategy;

    //! Only apply price strategy to items, not add-ons
    if (item.category.id !== '__add_ons__') {
      if (priceStrategy && priceStrategy.strategy === 'dynamic_pricing') {
        discount = priceStrategy.value;
        discountedPrice = item.foxsell_price - (item.foxsell_price * (discount / 100));
      }
    } else {
      if(itemPrice === 0) {
        itemPrice = item.price;
      }
    }

    const addOnStrategy = this.foxsell.config.additionalSettings.add_on_settings.strategy;

    return (`
      <foxsell-bundle-line-item data-item-id="${item.id}" data-category-id="${item.category.id}" data-category-title="${item.category.title}" data-quantity="${item.quantity}" class="foxsell-bundle-summary__item">
        <div><img src="${itemImage}"/></div>
        <div class="foxsell-bundle-summary__item-info">
          ${item.category.id === '__add_ons__' ? `<span class="foxsell-bundle-summary__item-add-on-tag">${this.foxsell.config.locale.addOnsLineItemLabel}</span>` : ''}
          <div class="foxsell-bundle-summary__item-title">${item.product.title}</div>
          ${item.option1 !== 'Default Title' ? `<div>${item.options.join(", ")}</div>` : ''}
          ${(item.category.id === '__add_ons__' || priceStrategy?.strategy === 'dynamic_pricing') ? `
          <div>
            ${itemPrice > discountedPrice ? `
              <div>
                <span class="foxsell-sale-price">${window.foxsell?.formatMoney?.(discountedPrice)}</span>
                <span class="foxsell-compare-at-price">${window.foxsell?.formatMoney?.(itemPrice)}</span>
                ${discount > 0 ? `<span>(${discount}% off)</span>`: ''}
              </div>`
              :
              `<div>
                <span class="foxsell-sale-price">${window.foxsell?.formatMoney?.(itemPrice)}</span>
              </div>`
            }
          </div>` : ''}
        </div>
        <div class="foxsell-bundle-summary__quantity">x ${item.quantity}</div>
        ${item.category.id === '__add_ons__' && addOnStrategy === 'automatic_add' ? ""
          : `
          <div>
            <button class="foxsell--button foxsell--button-ghost foxsell-bundle-summary__item-delete" aria-label="Remove item from bundle">
              ${DELETE_ICON_SVG}
            </button>
          </div>`
        }
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
    this.boundHandleBundleUpdate = this.handleBundleUpdate.bind(this);
    const configEl = this.querySelector('#foxsell-bundle-progress-config');

    try {
      this.config = JSON.parse(configEl?.textContent || '{}');
    } catch (error) {
      console.error('Failed to parse foxsell bundle progress config:', error);
      this.config = {};
    }
  }

  connectedCallback() {
    this.handleBundleUpdate();

    if (this.foxsell) {
      this.foxsell.addEventListener(FOXSELL_EVENTS.bundleUpdated, this.boundHandleBundleUpdate);
    }
  }

  disconnectedCallback() {
    if (this.foxsell) {
      this.foxsell.removeEventListener(FOXSELL_EVENTS.bundleUpdated, this.boundHandleBundleUpdate);
    }
  }

  handleBundleUpdate() {
    if (this.dataset.type === 'summary-header') {
      this.updateSummaryHeader();
    } else if (this.dataset.type === 'progress-bar') {
      this.updateProgressBar();
    }
  }

  updateSummaryHeader() {
    if (!this.foxsell?.config?.options?.length) return;

    const options = this.foxsell.config.options;
    const currentValidOption = this.foxsell.getCurrentValidOption() ?? options[0];
    const selectedId = String(currentValidOption?.variant_id ?? '');

    this.querySelectorAll('.foxsell-bundle-progress__item').forEach((el) => {
      el.classList.toggle('active', String(el.getAttribute('data-id') ?? '') === selectedId);
    });

    const priceValueEl = this.querySelector('.foxsell-bundle-progress__price-value');
    if (!priceValueEl) return;

    const { originalTotalPrice, totalPrice } = this.foxsell.bundle ?? {};
    const formatMoney = window.foxsell.formatMoney;

    if (originalTotalPrice > totalPrice) {
      priceValueEl.innerHTML = `
        <span class="foxsell-compare-at-price">${formatMoney(originalTotalPrice)}</span>
        <span class="foxsell-sale-price">${formatMoney(totalPrice)}</span>
      `;
    } else {
      priceValueEl.innerHTML = `<span class="foxsell-sale-price">${formatMoney(totalPrice)}</span>`;
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
    const currentStep = bundle.reduce((acc, item) => acc + item.quantity, 0);
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
    const bundleQuantity = bundle.reduce((acc, item) => acc + item.quantity, 0);

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

    const currentStep = optionIndex + 1;

    const currentOption = this.foxsell.config.options[optionIndex];
    const prevOption = optionIndex > 0 ? this.foxsell.config.options[optionIndex - 1] : undefined;

    let isCompleted = (currentStep === maxSteps) && (bundleQuantity >= (currentOption?.quantity ?? 0));

    let currentQuantity = bundleQuantity;
    let requiredQuantity = currentOption?.quantity ?? 0;
    if (prevOption) {
      currentQuantity = bundleQuantity - prevOption.quantity;
      requiredQuantity = (currentOption?.quantity ?? 0) - prevOption.quantity;
    }

    let progress = Math.min(Math.round((currentQuantity / requiredQuantity) * 100), 100);

    return {
      currentStep: bundleQuantity > 0 ? currentStep : 0,
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

  updateProgressBar() {
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

class FoxSellProductModal extends HTMLElement {
  constructor() {
    super();

    this.foxsell = this.closest('foxsell-mix-match');

    this.modal = this.querySelector('#foxsell-product-dialog[data-modal]');
    this.content = this.querySelector('.foxsell-product-modal__content');
    this.closeButton = this.querySelector('#foxsell-product-modal-close-button');
    this.boundCloseModal = this.closeModal.bind(this);
    this.boundOpenModal = this.openModal.bind(this);
    this.boundFoxSellKeyDown = this.handleKeyDown.bind(this);
    this.emptyState = this.querySelector('.foxsell-product-modal__empty-state');
  }

  connectedCallback() {
    const productCards = this.foxsell?.querySelectorAll('foxsell-product-card');
    if(productCards && productCards.length > 0) {
      productCards.forEach(card => {
        card.querySelector('[data-open-modal]')?.addEventListener('click', this.boundOpenModal);
      });
    }

    if(this.closeButton) {
      this.closeButton.addEventListener('click', this.boundCloseModal);
    }

    document.addEventListener('keydown', this.boundFoxSellKeyDown);
  }

  disconnectedCallback() {
    const productCards = this.foxsell?.querySelectorAll('foxsell-product-card');
    if(productCards && productCards.length > 0) {
      productCards.forEach(card => {
        card.querySelector('[data-open-modal]')?.removeEventListener('click', this.boundOpenModal);
      });
    }

    if(this.closeButton) {
      this.closeButton.removeEventListener('click', this.boundCloseModal);
    }

    document.removeEventListener('keydown', this.boundFoxSellKeyDown);
    unlockBodyScroll();
  }

  openModal(event) {
    if(!this.modal) return;
    this.modal.setAttribute('open', '');
    lockBodyScroll();

    if(this.content) this.content.innerHTML = this.emptyState?.outerHTML || '';

    if(!event.target) return;

    const productId = event.target?.closest('foxsell-product-card')?.dataset.productId;
    if(!productId) return;
    this.renderProductModal(productId);
  }

  handleKeyDown(event) {
    if(event.key === 'Escape' && this.modal?.hasAttribute('open')) {
      this.closeModal();
    }
  }

  closeModal() {
    if(!this.modal || !this.content) return;
    this.content.innerHTML = '';
    this.modal.removeAttribute('open');
    unlockBodyScroll();
  }

  async renderProductModal(productId) {
    if(!this.foxsell || !this.foxsell.config) return;
    const productHandle = this.foxsell.config.productHandle;
    const sectionName = 'foxsell-glow-product-modal';
    const response = await(await fetch(`/products/${productHandle}?sections=${sectionName}`)).json();

    const parser = new DOMParser();
    const doc = parser.parseFromString(response[sectionName], 'text/html');

    const productModal = doc.querySelector('foxsell-product-card[data-product-id="' + productId + '"]');
    if(!productModal || !this.content) return;
    this.content.innerHTML = productModal.outerHTML;
  }
}

class GlowFoxSellProductModal extends FoxSellProductModal {

  async renderProductModal(productId) {
    if(!this.foxsell || !this.foxsell.config) return;
    const productHandle = this.foxsell.config.productHandle;
    const sectionName = 'foxsell-glow-product-modal';
    const response = await(await fetch(`/products/${productHandle}?sections=${sectionName}`)).json();

    const parser = new DOMParser();
    const doc = parser.parseFromString(response[sectionName], 'text/html');

    const productModal = doc.querySelector('foxsell-product-card[data-product-id="' + productId + '"]');
    if(!productModal || !this.content) return;
    const addToBundleButton = productModal.querySelector('.foxsell--button-full-width.add-to-bundle');
    if(addToBundleButton) {
      addToBundleButton.textContent = this.foxsell.config.locale.addToBundleButtonText;
      addToBundleButton.setAttribute('aria-label', this.foxsell.config.locale.addToBundleButtonText);
    }
    this.content.innerHTML = productModal.outerHTML;
  }
}

class FoxSellProductForm extends HTMLElement {
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

  async handleSubmit(event) {
    event.preventDefault();

    const form = event.target;
    if(!(form instanceof HTMLFormElement)) return;

    const submitButton =  (form.querySelector('button[type="submit"]'));
    if (submitButton) submitButton.disabled = true;

    const formData = new FormData( (form));
    try {
      const result = await window.Shopify.actions.updateCart({
        lines: [{
          merchandiseId: `gid://shopify/ProductVariant/${formData.get("id")}`,
          quantity: parseInt(String(formData.get('quantity') ?? '1'), 10),
          attributes: this.getLineAttributes(formData)
        }]
      });

      if(result.userErrors?.length) {
        throw new Error("There was a error adding items to cart");
      }

      await window.Shopify.actions.openCart();
    } catch (error) {
      form.submit();
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }
}

const elements = [
  ['foxsell-category-navigation', FoxSellCategoryNavigation],
  ['foxsell-mix-match', GlowMixMatch],
  ['foxsell-category-header', FoxSellCategoryHeader],
  ['foxsell-product-card', GlowFoxSellProductCard],
  ['foxsell-bundle-summary', FoxSellBundleSummary],
  ['foxsell-bundle-line-item', FoxSellBundleLineItem],
  ['foxsell-bundle-progress', FoxSellBundleProgress],
  ['foxsell-variant-radio', FoxSellVariantRadio],
  ['foxsell-variant-select', FoxSellVariantSelect],
  ['foxsell-product-modal', GlowFoxSellProductModal],
  ['foxsell-product-form', FoxSellProductForm],
];

const overrides = window.foxsell?.overrides ?? {};

for (const [name, constructor] of elements) {
  if (customElements.get(name)) continue;
  const factory = overrides[name];
  customElements.define(name, factory ? factory(constructor) : constructor);
}
