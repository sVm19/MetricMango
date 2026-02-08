const admin = require("firebase-admin");
const { dateRangeKeys, toDateKey } = require("../utils/dateUtils");

function averageForRange(dailyMap, rangeKeys) {
  if (!rangeKeys.length) return 0;
  let total = 0;
  for (const key of rangeKeys) {
    total += Number(dailyMap[key] || 0);
  }
  return total / rangeKeys.length;
}

async function computeForecastForStore(storeId) {
  const db = admin.firestore();
  const productsSnap = await db.collection("products").where("storeId", "==", storeId).get();
  const products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const range7 = dateRangeKeys(7);
  const range14 = dateRangeKeys(14);
  const range30 = dateRangeKeys(30);

  const forecast = [];

  for (const product of products) {
    const salesSnap = await db.collection("daily_sales")
      .where("storeId", "==", storeId)
      .where("productId", "==", product.id)
      .where("date", ">=", range30[0])
      .get();

    const dailyMap = {};
    salesSnap.forEach(doc => {
      const data = doc.data();
      dailyMap[data.date] = Number(data.quantitySold || 0);
    });

    const avg7 = averageForRange(dailyMap, range7);
    const avg14 = averageForRange(dailyMap, range14);
    const avg30 = averageForRange(dailyMap, range30);

    const forecastNext7 = range7.map(() => Math.round(avg7));

    forecast.push({
      productId: product.id,
      name: product.name || "Unknown",
      currentStock: product.currentStock || 0,
      averages: {
        days7: avg7,
        days14: avg14,
        days30: avg30
      },
      forecastNext7
    });
  }

  return forecast;
}

async function getCachedForecast(storeId) {
  const db = admin.firestore();
  const todayKey = toDateKey(new Date());
  const cacheRef = db.collection("forecasts").doc(`${storeId}_${todayKey}`);
  const cacheSnap = await cacheRef.get();
  if (cacheSnap.exists) {
    return cacheSnap.data();
  }
  return null;
}

async function saveForecastCache(storeId, data) {
  const db = admin.firestore();
  const todayKey = toDateKey(new Date());
  await db.collection("forecasts").doc(`${storeId}_${todayKey}`).set({
    storeId,
    date: todayKey,
    computedAt: admin.firestore.Timestamp.now(),
    data
  }, { merge: true });
}

module.exports = {
  computeForecastForStore,
  getCachedForecast,
  saveForecastCache
};
