const admin = require("firebase-admin");
const { sendEmail } = require("./emailService");
const { computeRestockSuggestions, sortRestockItems } = require("./restockService");
const { resolveInventorySettings } = require("./inventorySettingsService");
const { toDateKey } = require("../utils/dateUtils");

function buildWeeklyActionPlan(items = []) {
  const restockItems = sortRestockItems(items.filter(item => String(item.suggestion || "") === "RESTOCK"));
  const totals = restockItems.reduce((acc, item) => {
    acc.atRiskSkus += 1;
    acc.requiredUnits += Number(item.recommendedReorderQty || 0);
    acc.revenueAtRisk += Number(item.revenueAtRisk || 0);
    return acc;
  }, {
    atRiskSkus: 0,
    requiredUnits: 0,
    revenueAtRisk: 0
  });

  return {
    items: restockItems,
    totals
  };
}

function buildWeeklyActionPlanEmailText(storeName, actionPlan) {
  const lines = [
    `Hi ${storeName || "there"},`,
    "",
    "Here is your weekly Metric Mango action plan:",
    ""
  ];

  actionPlan.items.slice(0, 5).forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.name || item.productId}`,
      item.supplierName ? `Supplier: ${item.supplierName}` : "Supplier: not set",
      `Stock cover: ${Number.isFinite(item.daysUntilStockout) ? `${item.daysUntilStockout} days` : "No sales velocity"}`,
      `Recommended reorder: ${item.recommendedReorderQty}`,
      `Revenue at risk: ${item.revenueAtRisk}`,
      ""
    );
  });

  lines.push(
    `At-risk SKUs: ${actionPlan.totals.atRiskSkus}`,
    `Required units: ${actionPlan.totals.requiredUnits}`,
    `Revenue at risk: ${actionPlan.totals.revenueAtRisk}`,
    "",
    "Open Metric Mango to review the full restock list."
  );

  return lines.join("\n");
}

async function sendWeeklyActionPlanForStore(storeId, dateKey = toDateKey(new Date())) {
  const db = admin.firestore();
  const storeRef = db.collection("stores").doc(String(storeId));
  const storeSnap = await storeRef.get();
  if (!storeSnap.exists) {
    throw new Error("Store not found");
  }

  const store = storeSnap.data() || {};
  const settings = resolveInventorySettings(store);
  if (!settings.weeklyActionPlanEnabled) {
    return { sent: 0, skipped: 0, reason: "Weekly action plan disabled" };
  }

  if (String(settings.weeklyActionPlanLastSentDate || "") === String(dateKey)) {
    return { sent: 0, skipped: 0, reason: "Already sent this week" };
  }

  const recipient = String(settings.alertRecipientEmail || "").trim();
  if (!recipient) {
    return { sent: 0, skipped: 0, reason: "Missing alert email" };
  }

  const restockResult = await computeRestockSuggestions(storeId, { storeSettings: settings });
  const actionPlan = buildWeeklyActionPlan(restockResult.suggestions);
  if (!actionPlan.items.length) {
    await storeRef.set({
      inventorySettings: {
        ...store.inventorySettings,
        weeklyActionPlanLastSentDate: dateKey
      }
    }, { merge: true });
    return { sent: 0, skipped: 0, reason: "No at-risk SKUs" };
  }

  await sendEmail({
    to: recipient,
    subject: `Weekly action plan: ${actionPlan.totals.atRiskSkus} SKU${actionPlan.totals.atRiskSkus === 1 ? "" : "s"} need attention`,
    text: buildWeeklyActionPlanEmailText(store.name, actionPlan)
  });

  await db.collection("weekly_action_plans").doc(`${storeId}_${dateKey}`).set({
    storeId: String(storeId),
    dateKey,
    recipientEmail: recipient,
    sentAt: admin.firestore.Timestamp.now(),
    itemCount: actionPlan.items.length,
    totals: actionPlan.totals,
    items: actionPlan.items
  }, { merge: true });

  await storeRef.set({
    inventorySettings: {
      ...store.inventorySettings,
      weeklyActionPlanLastSentDate: dateKey
    }
  }, { merge: true });

  return {
    sent: actionPlan.items.length,
    skipped: 0,
    totals: actionPlan.totals
  };
}

module.exports = {
  buildWeeklyActionPlan,
  buildWeeklyActionPlanEmailText,
  sendWeeklyActionPlanForStore
};
