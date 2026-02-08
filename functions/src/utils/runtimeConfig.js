const functions = require("firebase-functions");

function getFunctionsConfig() {
  try {
    return functions.config() || {};
  } catch (error) {
    // In some local contexts, functions.config() may not be available.
    return {};
  }
}

function getSecret(path, envFallback) {
  const config = getFunctionsConfig();
  const parts = String(path).split(".");
  let current = config;
  for (const part of parts) {
    current = current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined;
  }

  if (typeof current === "string" && current.trim()) return current.trim();
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
    }
  };
}

function getBillingFlags() {
  return {
    razorpayEnabled: getBooleanFlag("billing.razorpay_enabled", "BILLING_RAZORPAY_ENABLED"),
    lemonSqueezyEnabled: getBooleanFlag("billing.lemon_squeezy_enabled", "BILLING_LEMON_SQUEEZY_ENABLED")
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
    appUrl: getSecret("shopify.app_url", "SHOPIFY_APP_URL"),
    redirectUri: getSecret("shopify.redirect_uri", "SHOPIFY_REDIRECT_URI"),
    scopes: getSecret("shopify.scopes", "SHOPIFY_SCOPES") || "read_orders,read_products"
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
