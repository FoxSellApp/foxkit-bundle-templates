class FoxSellMixMatch extends HTMLElement {
  constructor() {
    super();
    this.updateHiddenInputs();
  }

  updateHiddenInputs() {
    const productOptions = Array.from(this.querySelectorAll('foxsell-product-options'));

    const bundleLineItems = productOptions.map(option => ({
      variantId: option.dataset.variantId,
      quantity: 1,
      category: option.dataset.category,
      type: 'product'
    }));

    this.querySelector('input[name="properties[__foxsell:dynamic_add_on_bundle_id]"]').value = this.dataset.bundleId+'_'+Date.now();
    this.querySelector('input[name="properties[__foxsell:dynamic_add_on_bundle_items]"]').value = JSON.stringify(bundleLineItems);
  }
}
customElements.define('foxsell-mix-match', FoxSellMixMatch);


class FoxSellProductOptions extends HTMLElement {
  constructor() {
    super();
    this.init();
  }

  init() {
    const scriptElement = this.querySelector('script[type="application/json"]');
    if (!scriptElement) return;

    const data = JSON.parse(scriptElement.textContent);
    const allVariants = data.product_variants || [];
    const availableVariantIds = Object.keys(data.available_variants || {});

    this.selectableVariants = allVariants.filter(variant => 
      availableVariantIds.includes(String(variant.id))
    );

    if (this.selectableVariants.length === 0) return;

    this.fieldsets = Array.from(this.querySelectorAll('fieldset'));

    this.addEventListener('change', this.handleVariantChange.bind(this));
    
    this.querySelectorAll('.product-swatch').forEach(swatch => {
      swatch.addEventListener('mouseenter', this.handleSwatchMouseEnter.bind(this));
      swatch.addEventListener('mouseleave', this.handleSwatchMouseLeave.bind(this));
    });

    this.updateAvailableOptions();
    this.closest('foxsell-mix-match').updateHiddenInputs();
  }

  handleSwatchMouseEnter(event) {
    const swatch = event.currentTarget;
    const imageUrl = swatch.getAttribute('data-variant-image-url');
    this.originalImageSrc = this.closest('foxsell-product-card').querySelector('.foxsell-product-card__image img').src;
    this.handleUpdateProductImage(imageUrl);
  }

  handleSwatchMouseLeave() {
    if(this.currentVariant && this.currentVariant.featured_image) {
      this.handleUpdateProductImage(this.currentVariant.featured_image.src);
    } else {
      this.handleUpdateProductImage(this.originalImageSrc);
    }
  }

  handleUpdateProductImage(imageUrl) {
    const productCard = this.closest('foxsell-product-card');
    const productImage = productCard.querySelector('.foxsell-product-card__image img');
    productImage.src = imageUrl;
    productImage.srcset = imageUrl;
  }

  getCurrentVariant() {
    const checkedInputs = this.querySelectorAll('input[type="radio"]:checked');
    this.selectedOptions = Array.from(checkedInputs).map(input => input.value);
    
    this.currentVariant = this.selectableVariants.find(variant => 
      variant.options.length === this.selectedOptions.length &&
      variant.options.every((option, index) => option === this.selectedOptions[index])
    );
    
    if (this.currentVariant) {
      this.dataset.variantId = this.currentVariant.id;
    } else {
      delete this.dataset.variantId;
    }
    
    // Update button state by checking all products in the bundle
    this.updateAddToCartButtonState();
  }

  updateAddToCartButtonState() {
    const mixMatchComponent = this.closest('foxsell-mix-match');
    if (!mixMatchComponent) return;
    
    const addToCartButton = document.querySelector('input[type="submit"][value="Add to cart"]');
    if (!addToCartButton) return;
    
    // Check all product options in the bundle
    const allProductOptions = mixMatchComponent.querySelectorAll('foxsell-product-options');
    let allProductsHaveValidVariants = true;
    
    allProductOptions.forEach(productOption => {
      // Check if this product has a valid variant selected
      if (!productOption.dataset.variantId || !productOption.currentVariant) {
        allProductsHaveValidVariants = false;
      }
    });
    
    addToCartButton.disabled = !allProductsHaveValidVariants;
  }

  updateAvailableOptions() {
    if (!this.fieldsets || this.fieldsets.length === 0) return;

    this.fieldsets.forEach((fieldset, levelIndex) => {
      const previousSelections = this.getPreviousSelections(levelIndex);
      
      const inputs = fieldset.querySelectorAll('input[type="radio"]');
      let hasAnyAvailable = false;
      
      inputs.forEach(input => {
        const isAvailable = this.isOptionAvailable(levelIndex, input.value, previousSelections);
        
        if (isAvailable) {
          input.disabled = false;
          hasAnyAvailable = true;
        } else {
          input.disabled = true;
        }
      });

      if (hasAnyAvailable) {
        const checked = fieldset.querySelector('input[type="radio"]:checked');
        if (!checked) {
          const firstAvailable = fieldset.querySelector('input[type="radio"]:not(:disabled)');
          if (firstAvailable) {
            firstAvailable.checked = true;
            this.updateLegendForFieldset(fieldset, firstAvailable.value);
          }
        } else {
          this.updateLegendForFieldset(fieldset, checked.value);
        }
      }
    });

    this.getCurrentVariant();
  }

  getPreviousSelections(levelIndex) {
    const selections = [];
    for (let i = 0; i < levelIndex; i++) {
      const checked = this.fieldsets[i].querySelector('input[type="radio"]:checked');
      if (checked) {
        selections[i] = checked.value;
      }
    }
    return selections;
  }

  isOptionAvailable(levelIndex, optionValue, previousSelections) {
    return this.selectableVariants.some(variant => {
      for (let i = 0; i < levelIndex; i++) {
        if (previousSelections[i] && variant.options[i] !== previousSelections[i]) {
          return false;
        }
      }
      return variant.options[levelIndex] === optionValue;
    });
  }

  handleVariantChange(event) {
    this.updateAvailableOptions();
    this.updateLegend(event);
    
    if (this.currentVariant && this.currentVariant.featured_image) {
      this.handleUpdateProductImage(this.currentVariant.featured_image.src);
    }

    this.closest('foxsell-mix-match').updateHiddenInputs();
  }

  updateLegend(event) {
    if (!event || !event.target) return;
    
    const changedInput = event.target;
    const fieldset = changedInput.closest('fieldset');
    if (!fieldset) return;
    
    this.updateLegendForFieldset(fieldset, changedInput.value);
  }

  updateLegendForFieldset(fieldset, selectedValue) {
    const legend = fieldset.querySelector('legend');
    if (!legend) return;
    
    const optionName = legend.textContent.split(':')[0].trim();
    legend.textContent = `${optionName}: ${selectedValue}`;
  }
}
customElements.define('foxsell-product-options', FoxSellProductOptions);


class FoxSellMixMatchCategory extends HTMLElement {
  constructor() {
    super();
    this.product = this.dataset.product;
    this.options = this.querySelectorAll('input[type="radio"].foxsell-m-m-combined');
    if(this.options.length === 0) return;

    this.options.forEach(option => {
      option.addEventListener('change', this.handleOptionChange.bind(this));
    });
  }

  async handleOptionChange(event) {
    console.log('handleOptionChange', event.target.value);
    const variantImageUrl = event.target.getAttribute('data-variant-image-url');
    if(variantImageUrl) {
      this.querySelector('.foxsell-product-card__image > img').src = variantImageUrl;
      this.querySelector('.foxsell-product-card__image > img').srcset = variantImageUrl;
    }

    const productOptions = await fetch(`/products/${this.product}?sections=foxsell-shadow-product-card`);
    const productOptionsHtml = await productOptions.json();


    const doc = new DOMParser().parseFromString(productOptionsHtml['foxsell-shadow-product-card'], 'text/html');
    const productOptionsElement = doc.querySelector('foxsell-product-options[data-product-id="' + event.target.value + '"]');

    this.querySelector('foxsell-product-options').replaceWith(productOptionsElement);

  }
}
customElements.define('foxsell-mix-match-category', FoxSellMixMatchCategory);