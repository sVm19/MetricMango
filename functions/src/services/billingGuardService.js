const { getBillingConfig, getBillingFlags } = require("../utils/runtimeConfig");
const { normalizeBillingProvider } = require("./billingProviderService");

function getEnabledProviders() {
  const flags = getBillingFlags();
  return {
    razorpay: Boolean(flags.razorpayEnabled),
    lemonsqueezy: Boolean(flags.lemonSqueezyEnabled)
  };
}

function hasRequiredSecrets(provider, action = "checkout") {
  const billingConfig = getBillingConfig();
  if (provider === "razorpay") {
    const hasKeySecret = Boolean(String(billingConfig.razorpay.keySecret || "").trim());
    const hasApiSecrets = Boolean(
      String(billingConfig.razorpay.keyId || "").trim()
      && hasKeySecret
    );
    if (action === "webhook") {
      // Current webhook verification uses keySecret.
      return hasKeySecret;
    }
    return hasApiSecrets && Boolean(String(billingConfig.razorpay.planId || "").trim());
  }

  if (provider === "lemonsqueezy") {
    if (action === "webhook") {
      return Boolean(String(billingConfig.lemonSqueezy.webhookSecret || "").trim());
    }
    return Boolean(
      String(billingConfig.lemonSqueezy.apiKey || "").trim()
      && String(billingConfig.lemonSqueezy.storeId || "").trim()
    );
  }

  return false;
}

function evaluateProviderGuard({
  provider,
  store,
  action = "checkout",
  requireStoreProviderMatch = true
}) {
  const normalizedProvider = normalizeBillingProvider(provider);
  if (!normalizedProvider) {
    return { ok: false, statusCode: 400, reason: "invalid_provider" };
  }

  const enabledProviders = getEnabledProviders();
  if (!enabledProviders[normalizedProvider]) {
    return { ok: false, statusCode: 403, reason: "provider_disabled", provider: normalizedProvider };
  }

  if (requireStoreProviderMatch) {
    const storeProvider = normalizeBillingProvider(store?.billingProvider);
    if (!storeProvider) {
      return { ok: false, statusCode: 400, reason: "missing_store_billing_provider", provider: normalizedProvider };
    }
    if (storeProvider !== normalizedProvider) {
      return { ok: false, statusCode: 403, reason: "store_provider_mismatch", provider: normalizedProvider };
    }
  }

  if (!hasRequiredSecrets(normalizedProvider, action)) {
    return { ok: false, statusCode: 500, reason: "missing_provider_secrets", provider: normalizedProvider };
  }

  return { ok: true, provider: normalizedProvider };
}

module.exports = {
  evaluateProviderGuard,
  getEnabledProviders,
  hasRequiredSecrets
};
