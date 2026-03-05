const admin = require("firebase-admin");
const { dateRangeKeys } = require("../utils/dateUtils");
const { resolveInventorySettings } = require("./inventorySettingsService");

function averageForRange(dailyMap, rangeKeys) {
  if (!rangeKeys.length) return 0;
  let total = 0;
  for (const key of rangeKeys) {
    const value = Number(dailyMap[key] || 0);
    total += Number.isFinite(value) && value > 0 ? value : 0;
  }
  return total / rangeKeys.length;
}

function roundToTwo(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizePositiveNumber(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return numeric;
}

function buildRestockSuggestion({ product = {}, dailyMap = {}, storeSettings = {}, leadTimeDaysOverride, rangeKeys } = {}) {
  const resolvedSettings = resolveInventorySettings({ inventorySettings: storeSettings });
  const avgDailySales = roundToTwo(averageForRange(dailyMap, Array.isArray(rangeKeys) && rangeKeys.length ? rangeKeys : dateRangeKeys(7)));
  const currentStock = normalizePositiveNumber(product.currentStock, 0);
  const price = normalizePositiveNumber(product.price, 0);
  const productLeadTime = Number(product.leadTimeDays);
  const effectiveLeadTimeDays = Number.isFinite(leadTimeDaysOverride) && leadTimeDaysOverride > 0
    ? Number(leadTimeDaysOverride)
    : (Number.isFinite(productLeadTime) && productLeadTime > 0 ? productLeadTime : resolvedSettings.defaultLeadTimeDays);
  const safetyBufferDays = resolvedSettings.safetyBufferDays;
  const planningWindowDays = effectiveLeadTimeDays + safetyBufferDays;
  const expectedDemand = roundToTwo(avgDailySales * planningWindowDays);
  const daysUntilStockout = avgDailySales > 0 ? roundToTwo(currentStock / avgDailySales) : Number.POSITIVE_INFINITY;
  const requiredUnits = Math.max(0, Math.ceil(expectedDemand - currentStock));
  const recommendedReorderQty = requiredUnits;
  const revenueAtRisk = roundToTwo(requiredUnits * price);
  const suggestion = requiredUnits > 0 ? "RESTOCK" : "SAFE";

  return {
    productId: String(product.id || product.productId || ""),
    name: String(product.name || "").trim(),
    supplierId: String(product.supplierId || "").trim(),
    supplierName: String(product.supplierName || "").trim(),
    lastLowStockAlertDate: String(product.lastLowStockAlertDate || "").trim(),
    lastSalesSpikeAlertDate: String(product.lastSalesSpikeAlertDate || "").trim(),
    leadTimeDays: effectiveLeadTimeDays,
    safetyBufferDays,
    planningWindowDays,
    currentStock,
    avgDailySales,
    expectedDemand,
    daysUntilStockout,
    requiredUnits,
    recommendedReorderQty,
    revenueAtRisk,
    price,
    suggestion
  };
}

function sortRestockItems(items = []) {
  return [...items].sort((first, second) => {
    const revenueDiff = Number(second.revenueAtRisk || 0) - Number(first.revenueAtRisk || 0);
    if (revenueDiff !== 0) return revenueDiff;
    return Number(first.daysUntilStockout || Number.POSITIVE_INFINITY) - Number(second.daysUntilStockout || Number.POSITIVE_INFINITY);
  });
}

async function computeRestockSuggestions(storeId, options = {}) {
  if (!storeId) {
    throw new Error("Missing storeId");
  }

  const db = admin.firestore();
  const leadTimeDaysOverride = Number(options.leadTimeDaysOverride);
  const range7 = dateRangeKeys(7);
  const startDate = range7[0];

  const [storeSnap, productsSnap, salesSnap] = await Promise.all([
    db.collection("stores").doc(String(storeId)).get(),
    db.collection("products").where("storeId", "==", storeId).get(),
    db.collection("daily_sales")
      .where("storeId", "==", storeId)
      .where("date", ">=", startDate)
      .get()
  ]);

  const store = storeSnap.exists ? (storeSnap.data() || {}) : {};
  const resolvedSettings = options.storeSettings
    ? resolveInventorySettings({ ...store, inventorySettings: options.storeSettings })
    : resolveInventorySettings(store);

  const products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const salesByProduct = new Map();

  salesSnap.forEach(doc => {
    const data = doc.data() || {};
    const productId = String(data.productId || "");
    if (!productId) return;
    const dailyMap = salesByProduct.get(productId) || {};
    dailyMap[String(data.date || "")] = Number(data.quantitySold || 0);
    salesByProduct.set(productId, dailyMap);
  });

  const suggestions = products.map(product => buildRestockSuggestion({
    product,
    dailyMap: salesByProduct.get(String(product.id)) || {},
    storeSettings: resolvedSettings,
    leadTimeDaysOverride: Number.isFinite(leadTimeDaysOverride) && leadTimeDaysOverride > 0 ? leadTimeDaysOverride : undefined,
    rangeKeys: range7
  }));

  return {
    leadTimeDays: Number.isFinite(leadTimeDaysOverride) && leadTimeDaysOverride > 0
      ? leadTimeDaysOverride
      : resolvedSettings.defaultLeadTimeDays,
    safetyBufferDays: resolvedSettings.safetyBufferDays,
    suggestions
  };
}

module.exports = {
  averageForRange,
  buildRestockSuggestion,
  computeRestockSuggestions,
  sortRestockItems
};
