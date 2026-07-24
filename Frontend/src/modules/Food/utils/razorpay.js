/**
 * Razorpay Payment Integration Utility
 * Handles Razorpay payment initialization and verification
 */

let razorpayLoaded = false;

const isLikelyWebView = () => {
  if (typeof window === "undefined") return false;
  const ua = window.navigator?.userAgent || "";
  return (
    /\bwv\b/i.test(ua) ||
    /WebView/i.test(ua) ||
    /; wv\)/i.test(ua) ||
    /Version\/[\d.]+.*Chrome\/[\d.]+ Mobile/i.test(ua)
  );
};

/**
 * Load Razorpay checkout script
 */
export const loadRazorpayScript = () => {
  return new Promise((resolve, reject) => {
    if (razorpayLoaded || window.Razorpay) {
      razorpayLoaded = true;
      resolve();
      return;
    }
    
    // Check if script is already added but not yet loaded
    const existing = document.querySelector('script[src*="razorpay"]');
    if (existing) {
      existing.onload = () => {
        razorpayLoaded = true;
        resolve();
      };
      existing.onerror = () => reject(new Error('Failed to load Razorpay script'));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    
    // Add timeout to prevent freeze
    const timeout = setTimeout(() => {
      reject(new Error('Razorpay script load timeout'));
    }, 10000);

    script.onload = () => {
      clearTimeout(timeout);
      razorpayLoaded = true;
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Failed to load Razorpay script'));
    };
    document.body.appendChild(script);
  });
};

/**
 * Initialize Razorpay payment
 * @param {Object} options - Payment options
 * @param {String} options.key - Razorpay key ID
 * @param {String} options.amount - Amount in paise
 * @param {String} options.currency - Currency code
 * @param {String} options.order_id - Razorpay order ID
 * @param {String} options.name - Company/App name
 * @param {String} options.description - Payment description
 * @param {String} options.prefill.name - Customer name
 * @param {String} options.prefill.email - Customer email
 * @param {String} options.prefill.contact - Customer phone
 * @param {Object} options.notes - Additional notes
 * @param {Function} options.handler - Success callback
 * @param {Function} options.onError - Error callback
 * @param {Function} options.onClose - Close callback
 */
export const initRazorpayPayment = async (options) => {
  try {
    // Load Razorpay script if not already loaded
    await loadRazorpayScript();

    if (!window.Razorpay) {
      throw new Error('Razorpay SDK not available');
    }

    const webViewMode = isLikelyWebView();
    let restoreWindowOpen = null;
    const restoreIfNeeded = () => {
      if (typeof restoreWindowOpen === "function") {
        restoreWindowOpen();
        restoreWindowOpen = null;
      }
    };

    const razorpayOptions = {
      key: options.key,
      amount: options.amount,
      currency: options.currency || 'INR',
      order_id: options.order_id,
      name: options.name || 'Switcheats',
      description: options.description || 'Order Payment',
      image: options.image || '/switcheats-logo.png',
      prefill: options.prefill || {},
      notes: options.notes || {},
      theme: {
        color: options.theme?.color || '#E23744'
      },
      handler: function(response) {
        restoreIfNeeded();
        if (options.handler) {
          options.handler(response);
        }
      },
      modal: {
        ondismiss: function() {
          restoreIfNeeded();
          if (options.onClose) {
            options.onClose();
          }
        },
        escape: true,
        animation: true,
        ...options.modal
      },
      retry: {
        enabled: true,
        max_count: 3,
        ...options.retry
      }
    };

    const razorpay = new window.Razorpay(razorpayOptions);
    
    // Handle payment failures
    razorpay.on('payment.failed', function(response) {
      restoreIfNeeded();
      console.error('Razorpay payment failed:', response);
      if (options.onError) {
        options.onError(response.error || { description: 'Payment failed. Please try again.' });
      }
    });

    // Handle payment method selection failures
    razorpay.on('payment.method_selection_failed', function(response) {
      restoreIfNeeded();
      console.error('Razorpay payment method selection failed:', response);
      if (options.onError) {
        options.onError(response.error || { description: 'Please select another payment method.' });
      }
    });

    // Flutter/embedded WebViews often block popup windows used during netbanking.
    // Route popup attempts to same tab so bank auth can continue instead of blank white screen.
    if (webViewMode && typeof window.open === "function") {
      const nativeWindowOpen = window.open.bind(window);
      window.open = (url, target, features) => {
        try {
          if (url) {
            window.location.assign(url);
            return window;
          }
        } catch (err) {
          console.warn("WebView window.open fallback failed, using native open", err);
        }
        return nativeWindowOpen(url, target, features);
      };
      restoreWindowOpen = () => {
        window.open = nativeWindowOpen;
      };
    }

    // Open Razorpay modal
    razorpay.open();
    
    console.log('✅ Razorpay checkout opened successfully');
    console.log('Razorpay options:', {
      key: razorpayOptions.key ? 'Present' : 'Missing',
      amount: razorpayOptions.amount,
      order_id: razorpayOptions.order_id
    });

    return razorpay;
  } catch (error) {
    console.error('Error initializing Razorpay:', error);
    if (options.onError) {
      options.onError(error);
    }
    throw error;
  }
};

/**
 * Format amount for display
 * @param {Number} amount - Amount in paise
 * @returns {String} Formatted amount string
 */
export const formatAmount = (amount) => {
  return `₹${(amount / 100).toFixed(2)}`;
};
