const admin = require("firebase-admin");
const { sendEmail } = require("./emailService");
const { resolveInventorySettings } = require("./inventorySettingsService");
const { toDateKey } = require("../utils/dateUtils");

const SAVE_OFFERS = {
  too_expensive: {
    type: "discount",
    title: "Keep Metric Mango for 25% less",
    description: "Take 25% off for the next 2 months while you keep alerts and forecasting running.",
    primaryAction: "Request discount"
  },
  not_using_enough: {
    type: "pause",
    title: "Pause for 30 days instead",
    description: "Pause usage while we keep your data and settings ready for when you come back.",
    primaryAction: "Request 30-day pause"
  },
  missing_feature: {
    type: "roadmap",
    title: "Tell us the missing workflow",
    description: "We will review the gap and follow up with the fastest workaround or roadmap fit.",
    primaryAction: "Share feature gap"
  },
  switching_to_competitor: {
    type: "feedback",
    title: "Tell us what is winning you over",
    description: "We use competitor feedback to prioritize the simplest save-worthy improvements.",
    primaryAction: "Share competitor feedback"
  },
  technical_issues: {
    type: "support",
    title: "Escalate the issue before you leave",
    description: "We will review the issue and follow up before making account changes.",
    primaryAction: "Request support follow-up"
  },
  seasonal: {
    type: "pause",
    title: "Pause for 60 days",
    description: "Seasonal stores can pause instead of cancelling and reactivate when demand picks back up.",
    primaryAction: "Request 60-day pause"
  },
  business_closed: {
    type: "respectful_exit",
    title: "Close out cleanly",
    description: "We will help you wrap up without extra friction.",
    primaryAction: "Continue"
  },
  other: {
    type: "feedback",
    title: "Tell us what changed",
    description: "A short note helps us route the request to the right follow-up.",
    primaryAction: "Send note"
  }
};

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function getSaveOfferForReason(reason) {
  return SAVE_OFFERS[String(reason || "").trim().toLowerCase()] || SAVE_OFFERS.other;
}

function computeInactiveDays(lastActiveAt, now = new Date()) {
  const millis = toMillis(lastActiveAt);
  if (!millis) return null;
  const diff = now.getTime() - millis;
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

function buildRetentionStatus(store = {}, latestRequest = null, now = new Date()) {
  const engagement = store.engagement || {};
  const retention = store.retention || {};
  const inactiveDays = computeInactiveDays(engagement.lastActiveAt, now);
  const recommendedIntervention = inactiveDays === null
    ? "monitor"
    : inactiveDays >= 21
      ? "reengage_now"
      : inactiveDays >= 14
        ? "send_value_recap"
        : inactiveDays >= 7
          ? "check_in"
          : "healthy";

  return {
    currentPlan: String(store.plan || "inactive"),
    lastActiveAt: engagement.lastActiveAt?.toDate ? engagement.lastActiveAt.toDate().toISOString() : (engagement.lastActiveAt || null),
    lastActivePage: String(engagement.lastActivePage || ""),
    inactiveDays,
    recommendedIntervention,
    latestRequest: latestRequest ? {
      id: String(latestRequest.id || ""),
      type: String(latestRequest.type || ""),
      reason: String(latestRequest.reason || ""),
      status: String(latestRequest.status || "requested"),
      createdAt: latestRequest.createdAt?.toDate ? latestRequest.createdAt.toDate().toISOString() : null,
      saveOffer: latestRequest.saveOffer || null
    } : null,
    saveOffers: SAVE_OFFERS,
    lastReengagementEmailDate: String(retention.lastReengagementEmailDate || "")
  };
}

function shouldSendReengagementEmail(store = {}, now = new Date()) {
  const inactiveDays = computeInactiveDays(store?.engagement?.lastActiveAt, now);
  if (inactiveDays === null || inactiveDays < 14) {
    return false;
  }
  const lastReengagementDate = String(store?.retention?.lastReengagementEmailDate || "");
  return lastReengagementDate !== toDateKey(now);
}

function buildReengagementEmailText(storeName, status) {
  return [
    `Hi ${storeName || "there"},`,
    "",
    "Metric Mango noticed that your store has been quiet lately.",
    "",
    "Here is the quickest way to get value again this week:",
    "1. Review your weekly action plan",
    "2. Check the SKUs with the shortest stock cover",
    "3. Export a reorder draft if anything is at risk",
    "",
    status?.inactiveDays ? `Inactive days: ${status.inactiveDays}` : "Inactive days: not enough data yet",
    "",
    "If timing is the issue, you can request a pause instead of cancelling."
  ].join("\n");
}

async function sendReengagementEmailForStore(storeId, now = new Date()) {
  const db = admin.firestore();
  const storeRef = db.collection("stores").doc(String(storeId));
  const storeSnap = await storeRef.get();
  if (!storeSnap.exists) {
    throw new Error("Store not found");
  }

  const store = storeSnap.data() || {};
  if (!shouldSendReengagementEmail(store, now)) {
    return { sent: 0, skipped: 1, reason: "Store not inactive enough" };
  }

  const settings = resolveInventorySettings(store);
  const recipient = String(settings.alertRecipientEmail || store.email || "").trim().toLowerCase();
  if (!recipient) {
    return { sent: 0, skipped: 1, reason: "Missing recipient" };
  }

  const status = buildRetentionStatus(store, null, now);
  await sendEmail({
    to: recipient,
    subject: "Metric Mango check-in: review your restock priorities",
    text: buildReengagementEmailText(store.name, status)
  });

  await storeRef.set({
    retention: {
      ...(store.retention || {}),
      lastReengagementEmailDate: toDateKey(now),
      lastReengagementEmailAt: admin.firestore.Timestamp.fromDate(now)
    }
  }, { merge: true });

  return { sent: 1, skipped: 0 };
}

module.exports = {
  buildRetentionStatus,
  buildReengagementEmailText,
  computeInactiveDays,
  getSaveOfferForReason,
  SAVE_OFFERS,
  sendReengagementEmailForStore,
  shouldSendReengagementEmail
};
