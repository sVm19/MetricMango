function normalizeCountry(value) {
  return String(value || "").trim().toUpperCase();
}

function decideBillingProviderFromCountry(country) {
  // Backend-only decision. Frontend should never pick the payment provider.
  // - India (IN) => Razorpay
  // - Otherwise => Lemon Squeezy
  return normalizeCountry(country) === "IN" ? "razorpay" : "lemonsqueezy";
}

function decideBillingProvider(store) {
  // Prefer Shopify store country, fallback to user-selected country, then currency.
  const shopCountry = normalizeCountry(store?.shopCountry);
  const userCountry = normalizeCountry(store?.country || store?.countryCode);
  if (shopCountry || userCountry) {
    return decideBillingProviderFromCountry(shopCountry || userCountry);
  }

  const currency = String(store?.currency || "").toUpperCase();
  if (currency === "INR") return "razorpay";
  return "lemonsqueezy";
}

function normalizeBillingProvider(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "razorpay") return "razorpay";
  if (normalized === "lemonsqueezy") return "lemonsqueezy";
  return "";
}

module.exports = {
  decideBillingProvider,
  decideBillingProviderFromCountry,
  normalizeBillingProvider,
  normalizeCountry
};
