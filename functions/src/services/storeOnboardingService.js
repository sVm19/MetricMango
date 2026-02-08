const admin = require("firebase-admin");
const { decideBillingProviderFromCountry, normalizeCountry, normalizeBillingProvider } = require("./billingProviderService");

async function ensureStoreOnboarding({ storeId, shopCountry, userCountry }) {
  if (!storeId) {
    throw new Error("Missing storeId");
  }

  const db = admin.firestore();
  const storeRef = db.collection("stores").doc(String(storeId));
  const storeSnap = await storeRef.get();
  const now = admin.firestore.Timestamp.now();

  const normalizedShopCountry = normalizeCountry(shopCountry);
  const normalizedUserCountry = normalizeCountry(userCountry);
  const countryForProvider = normalizedShopCountry || normalizedUserCountry;

  if (!storeSnap.exists) {
    // On first store creation, lock billing provider based on country.
    const billingProvider = decideBillingProviderFromCountry(countryForProvider);
    const newStore = {
      plan: "trial",
      trialStartAt: now,
      billingProvider
    };

    if (normalizedShopCountry) newStore.shopCountry = normalizedShopCountry;
    if (!normalizedShopCountry && normalizedUserCountry) newStore.country = normalizedUserCountry;

    await storeRef.set(newStore, { merge: true });
    return { created: true, billingProvider };
  }

  const store = storeSnap.data() || {};
  const existingProvider = normalizeBillingProvider(store.billingProvider);
  if (!existingProvider && countryForProvider) {
    // If provider is missing, set it once using the same country-based rule.
    const billingProvider = decideBillingProviderFromCountry(countryForProvider);
    const update = { billingProvider };
    if (normalizedShopCountry && !store.shopCountry) update.shopCountry = normalizedShopCountry;
    if (!normalizedShopCountry && normalizedUserCountry && !store.country) update.country = normalizedUserCountry;
    await storeRef.set(update, { merge: true });
    return { created: false, billingProvider };
  }

  return { created: false, billingProvider: existingProvider || "" };
}

module.exports = {
  ensureStoreOnboarding
};

