const admin = require("firebase-admin");
const { sendEmail } = require("./emailService");
const { resolveInventorySettings } = require("./inventorySettingsService");

/**
 * Evaluates metrics for anomalies and stores alerts.
 * 
 * Rules:
 * - Revenue drop greater than 30% compared to previous hour
 * - Orders equal to zero during the last hour
 * - Conversion rate below 1%
 * 
 * @param {string} storeId - Unique identifier for the store.
 * @param {Object} currentMetrics - Metrics for the current hour.
 * @param {Object} previousMetrics - Metrics for the previous hour, if available.
 * @param {Date} timestamp - Time of evaluation.
 */
async function detectAnomalies(storeId, currentMetrics, previousMetrics, timestamp = new Date()) {
    const db = admin.firestore();
    const rawAlerts = [];

    // Rule: Orders equal to zero during the last hour
    if (currentMetrics.orders === 0) {
        rawAlerts.push({
            alert_type: "zero_orders",
            message: "No orders were placed in the last hour.",
            action: "Check your shop's checkout payment gateways and review recent traffic sources to ensure the site is accessible."
        });
    }

    // Rule: Conversion rate below 1%
    if (currentMetrics.conversion_rate >= 0 && currentMetrics.conversion_rate < 1 && currentMetrics.visitors > 0) {
        rawAlerts.push({
            alert_type: "low_conversion_rate",
            message: `Conversion rate has dropped below 1% (currently ${currentMetrics.conversion_rate.toFixed(2)}%).`,
            action: "Review your recent traffic sources for any low-quality traffic spikes or verify if promotional discounts are functioning correctly."
        });
    }

    // Rule: Revenue drop greater than 30% compared to previous hour
    if (previousMetrics && previousMetrics.revenue > 0) {
        const revenueDrop = previousMetrics.revenue - currentMetrics.revenue;
        const dropPercentage = (revenueDrop / previousMetrics.revenue) * 100;

        if (dropPercentage > 30) {
            rawAlerts.push({
                alert_type: "revenue_drop",
                message: `Revenue dropped by ${dropPercentage.toFixed(1)}% compared to the previous hour.`,
                action: "Compare your recent ad spend against sales periods and check your top-selling products for unexpected stockouts."
            });
        }
    }

    if (rawAlerts.length === 0) return;

    // Rate Limiting: maximum 5 alerts per hour per store
    const oneHourAgo = new Date(timestamp.getTime() - 60 * 60 * 1000);
    const recentAlertsSnap = await db.collection("alerts")
        .where("store_id", "==", String(storeId))
        .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(oneHourAgo))
        .get();

    const alertsSentLastHour = recentAlertsSnap.size;
    const allowedAlerts = Math.max(0, 5 - alertsSentLastHour);

    if (allowedAlerts <= 0) {
        console.info(`Rate limit hit for store ${storeId}. Skipping ${rawAlerts.length} incoming alerts.`);
        return;
    }

    const toProcess = rawAlerts.slice(0, allowedAlerts);

    // Get Store Details to extract email and name
    const storeDoc = await db.collection("stores").doc(String(storeId)).get();
    if (!storeDoc.exists) return;

    const storeData = storeDoc.data();
    const settings = resolveInventorySettings(storeData);
    const recipientEmail = settings.alertRecipientEmail;
    const storeName = storeData.name || "Your Store";

    const batch = db.batch();
    const alertsCollection = db.collection("alerts");

    for (const alert of toProcess) {
        const alertRef = alertsCollection.doc();
        batch.set(alertRef, {
            store_id: String(storeId),
            alert_type: alert.alert_type,
            message: alert.message,
            timestamp: admin.firestore.Timestamp.fromDate(timestamp)
        });
    }

    await batch.commit();

    // Send Emails
    if (recipientEmail) {
        for (const alert of toProcess) {
            try {
                await sendEmail({
                    to: recipientEmail,
                    subject: `Alert triggered: ${alert.alert_type} for ${storeName}`,
                    text: `
Hello from Metric Mango,

An anomaly was detected on your store "${storeName}".

Alert Type: ${alert.alert_type}
Explanation: ${alert.message}

Suggested Action:
${alert.action}

Thanks,
Metric Mango
          `.trim()
                });
            } catch (err) {
                console.error(`Failed to send alert email to ${recipientEmail} for store ${storeId}.`, err);
            }
        }
    }
}

module.exports = {
    detectAnomalies
};
