const admin = require("firebase-admin");
const { sendEmail } = require("./emailService");
const { resolveInventorySettings } = require("./inventorySettingsService");
const { buildWeeklyReportHtml } = require("../templates/weeklyReportEmail");

/**
 * Generates and stores weekly analytics summaries for a store.
 * Calculates: total weekly revenue, total orders, best selling product, revenue growth.
 * @param {string} storeId
 * @param {Date} now
 * @returns {Promise<Object>} The structured summary object
 */
async function generateWeeklySummaryForStore(storeId, now = new Date()) {
    const db = admin.firestore();

    const storeRef = db.collection("stores").doc(String(storeId));
    const storeSnap = await storeRef.get();
    let storeName = "MetricMango Store";
    let recipientEmail = null;

    if (storeSnap.exists) {
        const store = storeSnap.data() || {};
        storeName = store.name || storeName;
        const settings = resolveInventorySettings(store);
        recipientEmail = settings.alertRecipientEmail || null;
    }

    // We are looking at the previous 7 days (current week) vs 14 days ago (previous week)
    const currentWeekEnd = now;
    const currentWeekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const previousWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const ordersSnap = await db.collection("orders")
        .where("storeId", "==", String(storeId))
        .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(previousWeekStart))
        .where("createdAt", "<=", admin.firestore.Timestamp.fromDate(currentWeekEnd))
        .get();

    let currentWeekRevenue = 0;
    let previousWeekRevenue = 0;
    const currentWeekOrderIds = new Set();
    const productTotals = {};

    const currentWeekStartMs = currentWeekStart.getTime();

    ordersSnap.forEach((doc) => {
        const data = doc.data();
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().getTime() : 0;

        let amount = 0;
        if (typeof data.totalAmount === 'number') {
            amount = data.totalAmount;
        } else {
            amount = Number(data.price || 0) * Number(data.quantity || 0);
        }

        if (createdAt >= currentWeekStartMs) {
            currentWeekRevenue += amount;
            if (data.orderId) {
                currentWeekOrderIds.add(data.orderId);
            } else {
                currentWeekOrderIds.add(doc.id);
            }
            if (data.productId && data.quantity) {
                productTotals[data.productId] = (productTotals[data.productId] || 0) + Number(data.quantity);
            }
        } else {
            previousWeekRevenue += amount;
        }
    });

    const totalOrders = currentWeekOrderIds.size;

    let bestSellingProductId = null;
    let bestSellingProductQty = 0;

    for (const [pId, qty] of Object.entries(productTotals)) {
        if (qty > bestSellingProductQty) {
            bestSellingProductQty = qty;
            bestSellingProductId = pId;
        }
    }

    let bestSellingProductName = null;
    if (bestSellingProductId) {
        try {
            const productDoc = await db.collection("products").doc(bestSellingProductId).get();
            if (productDoc.exists) {
                bestSellingProductName = productDoc.data().name || bestSellingProductId;
            } else {
                bestSellingProductName = bestSellingProductId;
            }
        } catch (err) {
            console.error(`Failed to fetch product name for ${bestSellingProductId}:`, err);
            bestSellingProductName = bestSellingProductId;
        }
    }

    const previousRevenue = previousWeekRevenue || 0;
    let revenueGrowthPercent = 0;
    if (previousRevenue > 0) {
        revenueGrowthPercent = ((currentWeekRevenue - previousRevenue) / previousRevenue) * 100;
    } else if (currentWeekRevenue > 0) {
        revenueGrowthPercent = 100;
    }

    const summary = {
        storeId,
        weekEnding: admin.firestore.Timestamp.fromDate(currentWeekEnd),
        weekStarting: admin.firestore.Timestamp.fromDate(currentWeekStart),
        totalWeeklyRevenue: currentWeekRevenue,
        totalOrders,
        revenueGrowthPercent,
        previousWeekRevenue,
        bestSellingProduct: bestSellingProductId ? {
            productId: bestSellingProductId,
            name: bestSellingProductName,
            quantitySold: bestSellingProductQty
        } : null
    };

    // Save to weekly_analytics_summaries collection for long-term tracking
    const timestampKey = currentWeekEnd.toISOString().split('T')[0];
    const docId = `${storeId}_${timestampKey}`;

    await db.collection("weekly_analytics_summaries").doc(docId).set({
        ...summary,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    if (recipientEmail) {
        // Fallback frontend URL pointing to dashboard
        const dashboardUrl = "https://app.metricmango.com/dashboard";
        const emailHtml = buildWeeklyReportHtml(storeName, summary, dashboardUrl);

        try {
            await sendEmail({
                to: recipientEmail,
                subject: "Your Weekly MetricMango Report",
                html: emailHtml
            });
            console.info(`Weekly report email sent successfully for store ${storeId}`);

            await db.collection("weekly_email_logs").doc(docId).set({
                storeId,
                recipientEmail,
                status: "delivered",
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                docId
            });
        } catch (error) {
            console.error(`Failed to send weekly report for store ${storeId}:`, error);
            await db.collection("weekly_email_logs").doc(docId).set({
                storeId,
                recipientEmail,
                status: "failed",
                error: error?.message || String(error),
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                docId
            });
        }
    }

    return summary;
}

module.exports = {
    generateWeeklySummaryForStore
};
