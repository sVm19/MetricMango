function getSecret(path, envFallback) {
  // `path` is kept for backward compatibility with existing call sites.
  void path;
  const fromEnv = process.env[envFallback];
  if (typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.trim();
  return "";
}

function getBooleanFlag(path, envFallback) {
  const configValue = getSecret(path, envFallback);
  const normalized = String(configValue || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function getBillingConfig() {
  return {
    lemonSqueezy: {
      storeId: getSecret("lemon_squeezy.store_id", "LEMON_SQUEEZY_STORE_ID"),
      apiKey: getSecret("lemon_squeezy.api_key", "LEMON_SQUEEZY_API_KEY"),
      webhookSecret: getSecret("lemon_squeezy.webhook_secret", "LEMON_SQUEEZY_WEBHOOK_SECRET")
    },
    razorpay: {
      keyId: getSecret("razorpay.key_id", "RAZORPAY_KEY_ID"),
      keySecret: getSecret("razorpay.key_secret", "RAZORPAY_KEY_SECRET"),
      webhookSecret: getSecret("razorpay.webhook_secret", "RAZORPAY_WEBHOOK_SECRET"),
      planId: getSecret("razorpay.plan_id", "RAZORPAY_PLAN_ID")
    },
    // PayPal: alternative global payment provider.
    paypal: {
      clientId: getSecret("paypal.client_id", "PAYPAL_CLIENT_ID"),
      clientSecret: getSecret("paypal.client_secret", "PAYPAL_CLIENT_SECRET"),
      webhookId: getSecret("paypal.webhook_id", "PAYPAL_WEBHOOK_ID"),
      planId: getSecret("paypal.plan_id", "PAYPAL_PLAN_ID"),
      apiBase: getSecret("paypal.api_base", "PAYPAL_API_BASE") || "https://api-m.sandbox.paypal.com"
    }
  };
}

function getBillingFlags() {
  return {
    razorpayEnabled: getBooleanFlag("billing.razorpay_enabled", "BILLING_RAZORPAY_ENABLED"),
    lemonSqueezyEnabled: getBooleanFlag("billing.lemon_squeezy_enabled", "BILLING_LEMON_SQUEEZY_ENABLED"),
    // PayPal: opt-in alternative checkout for global users.
    paypalEnabled: getBooleanFlag("billing.paypal_enabled", "BILLING_PAYPAL_ENABLED")
  };
}

function getEmailConfig() {
  return {
    resend: {
      apiKey: getSecret("resend.api_key", "RESEND_API_KEY"),
      from: getSecret("resend.from", "RESEND_FROM")
    }
  };
}

function getShopifyConfig() {
  return {
    webhookSecret: getSecret("shopify.webhook_secret", "SHOPIFY_WEBHOOK_SECRET"),
    appApiKey: getSecret("shopify.app_api_key", "SHOPIFY_APP_API_KEY"),
    appApiSecret: getSecret("shopify.app_api_secret", "SHOPIFY_APP_API_SECRET"),
    appUrl: getSecret("shopify.app_url", "SHOPIFY_APP_URL"),
    redirectUri: getSecret("shopify.redirect_uri", "SHOPIFY_REDIRECT_URI"),
    scopes: getSecret("shopify.scopes", "SHOPIFY_SCOPES") || "read_orders,read_products",
    apiVersion: getSecret("shopify.api_version", "SHOPIFY_API_VERSION") || "2024-10",
    tokenEncryptionKey: getSecret("shopify.token_encryption_key", "SHOPIFY_TOKEN_ENCRYPTION_KEY")
  };
}

function getOnboardingConfig() {
  return {
    debugResetEnabled: getBooleanFlag("onboarding.debug_reset_enabled", "ONBOARDING_DEBUG_RESET_ENABLED"),
    debugResetToken: getSecret("onboarding.debug_reset_token", "ONBOARDING_DEBUG_RESET_TOKEN")
  };
}

module.exports = {
  getBillingConfig,
  getBillingFlags,
  getEmailConfig,
  getShopifyConfig,
  getOnboardingConfig,
  getSecret
};
