const admin = require("firebase-admin");
const { sendEmail } = require("./emailService");
const { resolveInventorySettings } = require("./inventorySettingsService");
const { toDateKey } = require("../utils/dateUtils");

function roundToTwo(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function getSpikeAnalysisKeys(referenceDate = new Date()) {
  const keys = [];
  const cursor = new Date(referenceDate);
  cursor.setDate(cursor.getDate() - 8);
  for (let index = 0; index < 8; index += 1) {
    const next = new Date(cursor);
    next.setDate(cursor.getDate() + index);
    keys.push(toDateKey(next));
  }
  return keys;
}

function computeSalesSpikeCandidates({ products = [], salesByProduct = {}, settings = {}, todayKey, dateKeys } = {}) {
  const resolvedSettings = resolveInventorySettings({ inventorySettings: settings });
  const range8 = Array.isArray(dateKeys) && dateKeys.length === 8 ? dateKeys : getSpikeAnalysisKeys(new Date());
  const yesterdayKey = range8[range8.length - 1];
  const baselineKeys = range8.slice(0, -1);

  return products.map(product => {
    const dailyMap = salesByProduct[String(product.id)] || {};
    const yesterdayUnits = Number(dailyMap[yesterdayKey] || 0);
    const baselineAvg = baselineKeys.reduce((sum, key) => sum + Number(dailyMap[key] || 0), 0) / baselineKeys.length;
    const spikeThresholdUnits = baselineAvg * (1 + (resolvedSettings.salesSpikeThresholdPercent / 100));
    const alreadyAlerted = String(product.lastSalesSpikeAlertDate || "") === String(todayKey || "");
    const triggered = resolvedSettings.salesSpikeAlertsEnabled
      && baselineAvg >= 1
      && !alreadyAlerted
      && yesterdayUnits >= spikeThresholdUnits;

    return {
      productId: String(product.id || ""),
      name: String(product.name || "").trim(),
      yesterdayUnits: roundToTwo(yesterdayUnits),
      baselineAvg: roundToTwo(baselineAvg),
      spikeThresholdUnits: roundToTwo(spikeThresholdUnits),
      triggered,
      alreadyAlerted
    };
  });
}

function buildSalesSpikeDigestText(storeName, items = []) {
  const lines = [
    `Hi ${storeName || "there"},`,
    "",
    "We detected an unusual sales spike on these products yesterday:",
    ""
  ];
  items.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.name || item.productId}`,
      `Yesterday: ${item.yesterdayUnits} units`,
      `7-day baseline: ${item.baselineAvg} units`,
      `Spike threshold: ${item.spikeThresholdUnits} units`,
      ""
    );
  });
  lines.push("Review stock cover in Metric Mango and consider reordering sooner.");
  return lines.join("\n");
}

async function sendSalesSpikeAlertsForStore(storeId) {
  const db = admin.firestore();
  const todayKey = toDateKey(new Date());
  const analysisKeys = getSpikeAnalysisKeys(new Date());
  const [storeSnap, productsSnap, salesSnap] = await Promise.all([
    db.collection("stores").doc(String(storeId)).get(),
    db.collection("products").where("storeId", "==", storeId).get(),
    db.collection("daily_sales")
      .where("storeId", "==", storeId)
      .where("date", ">=", analysisKeys[0])
      .get()
  ]);

  if (!storeSnap.exists) {
    throw new Error("Store not found");
  }

  const store = storeSnap.data() || {};
  const settings = resolveInventorySettings(store);
  if (!settings.salesSpikeAlertsEnabled) {
    return { sent: 0, skipped: 0, reason: "Sales spike alerts disabled" };
  }

  const recipient = String(settings.alertRecipientEmail || "").trim();
  if (!recipient) {
    return { sent: 0, skipped: 0, reason: "Missing alert email" };
  }

  const products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const salesByProduct = {};
  salesSnap.forEach(doc => {
    const data = doc.data() || {};
    const productId = String(data.productId || "");
    if (!salesByProduct[productId]) salesByProduct[productId] = {};
    salesByProduct[productId][String(data.date || "")] = Number(data.quantitySold || 0);
  });

  const candidates = computeSalesSpikeCandidates({
    products,
    salesByProduct,
    settings,
    todayKey,
    dateKeys: analysisKeys
  });
  const actionableItems = candidates.filter(item => item.triggered);
  if (!actionableItems.length) {
    return { sent: 0, skipped: candidates.length, details: [] };
  }

  await sendEmail({
    to: recipient,
    subject: `Sales spike alert: ${actionableItems.length} product${actionableItems.length === 1 ? "" : "s"} accelerated`,
    text: buildSalesSpikeDigestText(store.name, actionableItems.slice(0, 10))
  });

  const batch = db.batch();
  actionableItems.forEach(item => {
    batch.set(db.collection("products").doc(String(item.productId)), {
      lastSalesSpikeAlertDate: todayKey
    }, { merge: true });
  });
  await batch.commit();

  return {
    sent: actionableItems.length,
    skipped: candidates.length - actionableItems.length,
    details: actionableItems.map(item => ({ productId: item.productId, status: "sent" }))
  };
}

module.exports = {
  buildSalesSpikeDigestText,
  computeSalesSpikeCandidates,
  getSpikeAnalysisKeys,
  sendSalesSpikeAlertsForStore
};
