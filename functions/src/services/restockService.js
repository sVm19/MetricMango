const admin = require("firebase-admin");
const { dateRangeKeys } = require("../utils/dateUtils");

function averageForRange(dailyMap, rangeKeys) {
  if (!rangeKeys.length) return 0;
  let total = 0;
  for (const key of rangeKeys) {
    const value = Number(dailyMap[key] || 0);
    // Guard against bad/negative values in stored sales.
    total += Number.isFinite(value) && value > 0 ? value : 0;
  }
  return total / rangeKeys.length;
}

async function computeRestockSuggestions(storeId, leadTimeDays) {
  // Security: never trust undefined/empty storeId.
  if (!storeId) {
    throw new Error("Missing storeId");
  }
  const db = admin.firestore();
  const sanitizedLeadTime = Number.isFinite(leadTimeDays) && leadTimeDays > 0 ? leadTimeDays : 7;

  // TODO: Consider paging products if store sizes grow; keep simple for now.
  // Security: always scope queries by storeId to prevent cross-store access.
  const productsSnap = await db.collection("products").where("storeId", "==", storeId).get();
  const products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  // Keep history short and focused on recent daily_sales only (avoid scanning all orders).
  const range7 = dateRangeKeys(7);
  const startDate = range7[0];

  const suggestions = await Promise.all(products.map(async product => {
    // TODO: If daily_sales grows large, add composite indexes or narrower queries as needed.
    // Security: always scope queries by storeId to prevent cross-store access.
    const salesSnap = await db.collection("daily_sales")
      .where("storeId", "==", storeId)
      .where("productId", "==", product.id)
      .where("date", ">=", startDate)
      .get();

    const dailyMap = {};
    salesSnap.forEach(doc => {
      const data = doc.data();
      const sold = Number(data.quantitySold || 0);
      // Ensure only non-negative numeric quantities are used.
      dailyMap[data.date] = Number.isFinite(sold) && sold > 0 ? sold : 0;
    });

    const hasSalesData = !salesSnap.empty;
    // If no sales data exists, default to 0 and keep suggestion SAFE.
    const rawAvgDailySales = hasSalesData ? averageForRange(dailyMap, range7) : 0;
    const avgDailySales = Math.round(rawAvgDailySales * 100) / 100;

    // Treat missing/invalid/negative stock as 0.
    const rawStock = Number(product.currentStock ?? 0);
    const currentStock = Number.isFinite(rawStock) && rawStock > 0 ? rawStock : 0;

    const rawExpectedDemand = avgDailySales * sanitizedLeadTime;
    const expectedDemand = Math.round((Number.isFinite(rawExpectedDemand) ? rawExpectedDemand : 0) * 100) / 100;

    // Only suggest RESTOCK when we have demand that exceeds current stock.
    const suggestion = expectedDemand > currentStock ? "RESTOCK" : "SAFE";

    return {
      productId: product.id,
      currentStock,
      avgDailySales,
      expectedDemand,
      suggestion
    };
  }));

  return suggestions;
}

module.exports = {
  computeRestockSuggestions
};
