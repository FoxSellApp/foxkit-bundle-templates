// @ts-check
const FOXSELL_EVENTS = {
  addToSet: 'foxsell:add-to-set',
  removeFromSet: 'foxsell:remove-from-set',
  setItemUpdated: 'foxsell:set-item-updated',
  categoryValidated: 'foxsell:category-validated',
}

// Foxsell Mix Match
class FoxSellMixMatch extends HTMLElement {
  constructor() {
    super();
    this.subscribers = {};
    this.selectedProducts = {};
    
    // Parse config safely
    try {
      const configElement = this.querySelector('#foxsell-config[type="application/json"]');
      this.config = configElement ? JSON.parse(configElement.textContent || '{}') : {};
    } catch (error) {
      console.error('Failed to parse foxsell config:', error);
      this.config = {};
    }
  }

  connectedCallback() {
    this.addToSetUnsubscribe =  this.subscribe(FOXSELL_EVENTS.addToSet, this.handleAddToSet.bind(this));
    this.removeFromSetUnsubscribe =  this.subscribe(FOXSELL_EVENTS.removeFromSet, this.handleRemoveFromSet.bind(this));
    
    // Initialize validation state after DOM is ready
    this.validateSet();
  }

  disconnectedCallback() {
    if(this.addToSetUnsubscribe) this.addToSetUnsubscribe();
    if(this.removeFromSetUnsubscribe) this.removeFromSetUnsubscribe();
  }

  subscribe(eventName, callback) {
    if (this.subscribers[eventName] === undefined) {
      this.subscribers[eventName] = []
    }

    this.subscribers[eventName] = [...this.subscribers[eventName], callback];

    // Return unsubscribe function with proper context binding
    return () => {
      if (this.subscribers[eventName]) {
        this.subscribers[eventName] = this.subscribers[eventName].filter((cb) => {
          return cb !== callback
        });
      }
    }
  }

  publish(eventName, data) {
    if (this.subscribers[eventName]) {
      this.subscribers[eventName].forEach((callback) => {
        callback(data)
      })
    }
  }

  productInCategory(category, variant) {
    const categoryData = this.selectedProducts[category];
    return categoryData?.items?.some(item => item.id === variant.id) || false;
  }

  addProductToSet(category, variant, quantity) {
    const categoryData = this.selectedProducts[category];
    if (!categoryData) return;
    
    const existingItem = categoryData.items.find(item => item.id === variant.id);
    
    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      categoryData.items.push({
        ...variant,
        quantity: quantity
      });
    }
    
    categoryData.totalQuantity += quantity;
    this.validateSet();
    
    // Find item again for the event (could be optimized further)
    const updatedItem = categoryData.items.find(item => item.id === variant.id);
    this.publish(FOXSELL_EVENTS.setItemUpdated, {
      category: {
        title: category,
        items: categoryData.items,
        quantity: categoryData.totalQuantity
      },
      item: updatedItem,
    });
  }

  removeProductFromSet(category, variant, quantity) {
    const categoryData = this.selectedProducts[category];
    if (!categoryData) return;
    
    const item = categoryData.items.find(item => item.id === variant.id);
    if (!item) return;
    
    item.quantity -= quantity;
    const updatedItem = { ...item };
    
    if (item.quantity <= 0) {
      categoryData.items = categoryData.items.filter(item => item.id !== variant.id);
      updatedItem.quantity = 0;
    }
    
    categoryData.totalQuantity -= quantity;
    this.validateSet();
    
    this.publish(FOXSELL_EVENTS.setItemUpdated, {
      category: {
        title: category,
        items: categoryData.items,
        quantity: categoryData.totalQuantity
      },
      item: updatedItem
    });
  }

  handleRemoveFromSet(event) {
    const { category, quantity, variant } = event;
    if(!this.selectedProducts[category]) return;
    this.removeProductFromSet(category, variant, quantity);
  }

  handleAddToSet(event) {
    const { category, quantity, variant } = event;
    if(!this.selectedProducts[category]) {
      this.selectedProducts[category] = {
        items: [],
        totalQuantity: 0
      };
    }
    this.addProductToSet(category, variant, quantity);
  }

  validateSet() {
    const categories = this.config.categories || [];
    if (!Array.isArray(categories)) return;
    
    let isValid = true;
  
    // Validate each category individually
    for (const category of categories) {
      if (!category || !category.title) continue;
      
      const selected = this.selectedProducts[category.title];
      const currentQty = selected?.totalQuantity || 0;
      const requiredQty = category.quantity || 0;
      const categoryIsValid = currentQty >= requiredQty;
      
      // Dispatch event for this specific category
      this.publish(FOXSELL_EVENTS.categoryValidated, {
        category: {
          title: category.title,
          quantity: currentQty,
          items: selected?.items || []
        },
        isValid: categoryIsValid
      });
      
      if (!categoryIsValid) {
        isValid = false;
      }
    }
    this.updateBundleProperties();
    this.toggleAddToSetButton(!isValid);
  }

  updateBundleProperties() {
    const bundleProperties = [];

    this.config.categories.forEach(category => {
      const selectedCategory = this.selectedProducts[category.title];
      if(!selectedCategory) return;
      
      selectedCategory.items.forEach(item => {
        bundleProperties.push({
          variantId: item.id,
          category: category.title,
          quantity: item.quantity,
          type: 'product'
        });
      });
    });

   let bundleItemsInput = this.querySelector('input[name="properties[__foxsell:dynamic_add_on_bundle_items]"]');
   let bundleIdInput = this.querySelector('input[name="properties[__foxsell:dynamic_add_on_bundle_id]"]');

   if(!bundleItemsInput || !bundleIdInput) return;
   bundleIdInput.setAttribute('value', this.config.bundleId+"_"+Date.now())
   bundleItemsInput.setAttribute('value', JSON.stringify(bundleProperties));
  }


  // NOTE: This code needs to be changed depending on theme implementation
  toggleAddToSetButton(disable) {
    console.log(this.selectedProducts)
    // Scope selector to this element instead of document
    const form = this.querySelector('form[action*="/cart/add"]') || this.closest('form');
    const addToSetButton = form?.querySelector('button[type="submit"], input[type="submit"]');
    
    if (!addToSetButton) return;

    if (disable) {
      addToSetButton.setAttribute('disabled', 'disabled');
    } else {
      addToSetButton.removeAttribute('disabled');
    }
  }
}

customElements.define('foxsell-mix-match', FoxSellMixMatch);