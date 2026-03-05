const admin = require("firebase-admin");
const { sendEmail } = require("./emailService");
const { resolveInventorySettings } = require("./inventorySettingsService");
const { computeRestockSuggestions, sortRestockItems } = require("./restockService");
const { toDateKey } = require("../utils/dateUtils");

function isLowStockSuggestion(item, settings) {
  const daysThreshold = Number(settings.lowStockThresholdDays || 0);
  const unitsThreshold = settings.lowStockThresholdUnits;
  const daysTriggered = Number.isFinite(Number(item.daysUntilStockout))
    && Number(item.daysUntilStockout) <= daysThreshold;
  const unitsTriggered = unitsThreshold !== null
    && unitsThreshold !== undefined
    && Number(item.currentStock || 0) <= Number(unitsThreshold);
  return daysTriggered || unitsTriggered;
}

function buildLowStockDigestText(storeName, settings, items) {
  const intro = [
    `Hi ${storeName || "there"},`,
    "",
    "These products need attention based on your current inventory alert settings:",
    ""
  ];

  const lines = items.map((item, index) => (
    `${index + 1}. ${item.name || item.productId}
Current stock: ${item.currentStock}
Stock cover: ${Number.isFinite(item.daysUntilStockout) ? `${item.daysUntilStockout} days` : "No sales velocity"}
Recommended reorder: ${item.recommendedReorderQty}
Revenue at risk: ${item.revenueAtRisk}`
  ));

  const footer = [
    "",
    `Alert frequency: ${settings.alertFrequency}`,
    `Threshold days: ${settings.lowStockThresholdDays}`,
    settings.lowStockThresholdUnits === null ? "Threshold units: off" : `Threshold units: ${settings.lowStockThresholdUnits}`,
    "",
    "Open Metric Mango to review the full restock list."
  ];

  return [...intro, ...lines, ...footer].join("\n");
}

async function sendLowStockDigestForStore(storeId, overrides = {}) {
  const db = admin.firestore();
  const storeSnap = await db.collection("stores").doc(String(storeId)).get();
  if (!storeSnap.exists) {
    throw new Error("Store not found");
  }

  const store = storeSnap.data() || {};
  const settings = {
    ...resolveInventorySettings(store),
    ...(overrides.thresholdDays ? { lowStockThresholdDays: Number(overrides.thresholdDays) } : {}),
    ...(Object.prototype.hasOwnProperty.call(overrides, "thresholdUnits")
      ? { lowStockThresholdUnits: overrides.thresholdUnits }
      : {})
  };

  if (!settings.lowStockAlertsEnabled) {
    return { sent: 0, skipped: 0, reason: "Low stock alerts disabled" };
  }

  const recipient = String(settings.alertRecipientEmail || "").trim();
  if (!recipient) {
    return { sent: 0, skipped: 0, reason: "Missing alert email" };
  }

  const todayKey = toDateKey(new Date());
  const result = await computeRestockSuggestions(storeId, { storeSettings: settings });
  const candidates = sortRestockItems(result.suggestions.filter(item => isLowStockSuggestion(item, settings)));

  const actionableItems = candidates.filter(item => String(item.lastLowStockAlertDate || "") !== todayKey);
  if (!actionableItems.length) {
    return { sent: 0, skipped: candidates.length, thresholdDays: settings.lowStockThresholdDays, details: [] };
  }

  const subject = actionableItems.length === 1
    ? `Low stock alert: ${actionableItems[0].name || actionableItems[0].productId}`
    : `Low stock alert: ${actionableItems.length} products need attention`;
  const text = buildLowStockDigestText(store.name, settings, actionableItems.slice(0, 10));

  await sendEmail({ to: recipient, subject, text });

  const batch = db.batch();
  actionableItems.forEach(item => {
    const ref = db.collection("products").doc(String(item.productId));
    batch.set(ref, {
      lastLowStockAlertDate: todayKey,
      lastLowStockAlertAt: admin.firestore.Timestamp.now()
    }, { merge: true });
  });
  await batch.commit();

  return {
    sent: actionableItems.length,
    skipped: candidates.length - actionableItems.length,
    thresholdDays: settings.lowStockThresholdDays,
    details: actionableItems.map(item => ({ productId: item.productId, status: "sent" }))
  };
}

async function sendConfiguredLowStockAlertsForStore(storeId) {
  return sendLowStockDigestForStore(storeId);
}

async function sendLowStockAlertsForStore(storeId, thresholdDays = 5) {
  return sendLowStockDigestForStore(storeId, { thresholdDays });
}

module.exports = {
  buildLowStockDigestText,
  isLowStockSuggestion,
  sendConfiguredLowStockAlertsForStore,
  sendLowStockAlertsForStore
};
