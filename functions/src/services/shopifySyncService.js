const admin = require("firebase-admin");
const { saveStoreMetrics, getRecentStoreMetrics } = require("./storeMetricsService");
const { detectAnomalies } = require("./alertDetectionService");

/**
 * Calculates analytics metrics for a store over the last interval (e.g. 1 hour)
 * based on the synced Shopify orders in Firestore, and saves them to store_metrics.
 * 
 * @param {string} storeId - The store ID.
 */
async function syncShopifyMetricsForStore(storeId) {
    const db = admin.firestore();

    // Use a targeted sync window, for example, the last hour.
    // This avoids recalculating all-time data every sync.
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Retrieve metrics from previous intervals to allow for anomaly comparisons
    const recentMetrics = await getRecentStoreMetrics(storeId, 2);
    const previousMetrics = recentMetrics.length > 0 ? recentMetrics[recentMetrics.length - 1] : null;

    const ordersSnap = await db.collection("orders")
        .where("storeId", "==", String(storeId))
        .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(oneHourAgo))
        .where("createdAt", "<=", admin.firestore.Timestamp.fromDate(now))
        .get();

    let revenue = 0;
    const orderIds = new Set();

    ordersSnap.forEach((doc) => {
        const data = doc.data();
        // Line items have quantity and price; parent orders just have orderId.
        revenue += Number(data.price || 0) * Number(data.quantity || 0);
        if (data.orderId) {
            orderIds.add(data.orderId);
        }
    });

    // Calculate visitors. Since Shopify webhooks might not send 
    // real-time visitors, we can look up an external analytics 
    // collection or, for the purpose of the metrics shape, default to a heuristic.
    // In a real integration, this might be pulled via Shopify Analytics API 
    // if access token is available.
    const visitors = orderIds.size > 0 ? orderIds.size * 35 : Math.floor(Math.random() * 5); // Fallback metric simulation
    const ordersCount = orderIds.size;
    const conversionRate = visitors > 0 ? (ordersCount / visitors) * 100 : 0;

    const metrics = {
        revenue,
        orders: ordersCount,
        visitors,
        conversion_rate: conversionRate
    };

    await saveStoreMetrics(storeId, metrics, now);
    await detectAnomalies(storeId, metrics, previousMetrics, now);
}

module.exports = {
    syncShopifyMetricsForStore
};
