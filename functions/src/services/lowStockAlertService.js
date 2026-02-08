const admin = require("firebase-admin");
const { dateRangeKeys, toDateKey } = require("../utils/dateUtils");
const { sendEmail } = require("./emailService");

function averageForRange(dailyMap, rangeKeys) {
  if (!rangeKeys.length) return 0;
  let total = 0;
  for (const key of rangeKeys) {
    const value = Number(dailyMap[key] || 0);
    total += Number.isFinite(value) && value > 0 ? value : 0;
  }
  return total / rangeKeys.length;
}

function formatDays(value) {
  if (!Number.isFinite(value)) return "N/A";
  return value.toFixed(1);
}

async function sendLowStockAlertsForStore(storeId, thresholdDays = 5) {
  if (!storeId) {
    throw new Error("Missing storeId");
  }

  const db = admin.firestore();
  const todayKey = toDateKey(new Date());
  const sanitizedThreshold = Number.isFinite(thresholdDays) && thresholdDays > 0 ? thresholdDays : 5;

  const storeSnap = await db.collection("stores").doc(String(storeId)).get();
  if (!storeSnap.exists) {
    throw new Error("Store not found");
  }

  const store = storeSnap.data();
  const recipient = store.alertEmail || store.email;
  if (!recipient) {
    return { sent: 0, skipped: 0, reason: "Missing alert email" };
  }

  const productsSnap = await db.collection("products").where("storeId", "==", storeId).get();
  const products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const range7 = dateRangeKeys(7);
  const startDate = range7[0];

  let sent = 0;
  let skipped = 0;
  const details = [];

  for (const product of products) {
    const currentStock = Number(product.currentStock ?? 0);
    const safeStock = Number.isFinite(currentStock) && currentStock > 0 ? currentStock : 0;

    const salesSnap = await db.collection("daily_sales")
      .where("storeId", "==", storeId)
      .where("productId", "==", product.id)
      .where("date", ">=", startDate)
      .get();

    const dailyMap = {};
    salesSnap.forEach(doc => {
      const data = doc.data();
      const sold = Number(data.quantitySold || 0);
      dailyMap[data.date] = Number.isFinite(sold) && sold > 0 ? sold : 0;
    });

    const avgDailySales = averageForRange(dailyMap, range7);
    const safeAvg = Number.isFinite(avgDailySales) && avgDailySales > 0 ? avgDailySales : 0;
    const daysUntilStockout = safeAvg > 0 ? safeStock / safeAvg : Infinity;

    const alreadyAlerted = product.lastLowStockAlertDate === todayKey;
    if (alreadyAlerted) {
      skipped += 1;
      details.push({ productId: product.id, status: "skipped", reason: "already_alerted" });
      continue;
    }

    if (daysUntilStockout > sanitizedThreshold) {
      skipped += 1;
      details.push({ productId: product.id, status: "skipped", reason: "not_within_threshold" });
      continue;
    }

    const subject = `Low stock alert: ${product.name || product.id}`;
    const text = [
      `Product: ${product.name || product.id}`,
      `Current stock: ${safeStock}`,
      `Avg daily sales: ${safeAvg.toFixed(2)}`,
      `Estimated days until stockout: ${formatDays(daysUntilStockout)}`,
      "",
      // TODO: Polish this email template with clearer guidance and branding.
      "Consider restocking soon to avoid running out."
    ].join("\n");

    await sendEmail({ to: recipient, subject, text });

    await db.collection("products").doc(product.id).set({
      lastLowStockAlertDate: todayKey,
      lastLowStockAlertAt: admin.firestore.Timestamp.now()
    }, { merge: true });

    sent += 1;
    details.push({ productId: product.id, status: "sent" });
  }

  return {
    sent,
    skipped,
    thresholdDays: sanitizedThreshold,
    details
  };
}

module.exports = {
  sendLowStockAlertsForStore
};
