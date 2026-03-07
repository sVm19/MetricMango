const admin = require("firebase-admin");

/**
 * Saves analytics metrics for a specific store.
 * 
 * @param {string} storeId - Unique identifier for the store.
 * @param {Object} metrics - Analytics metrics.
 * @param {number} metrics.revenue - Total revenue in the interval.
 * @param {number} metrics.orders - Total order count in the interval.
 * @param {number} metrics.visitors - Unique visitors in the interval.
 * @param {number} metrics.conversion_rate - Calculated conversion rate.
 * @param {Date} [timestamp] - Date object for the metric interval. Defaults to now.
 */
async function saveStoreMetrics(storeId, metrics, timestamp = new Date()) {
    if (!storeId) {
        throw new Error("storeId is required to save metrics.");
    }

    const db = admin.firestore();

    // Use a deterministic document ID to prevent duplicate entries for the same interval
    // Based on the Unix timestamp in seconds
    const intervalUnix = Math.floor(timestamp.getTime() / 1000);
    const docId = `${storeId}_${intervalUnix}`;

    // Make sure we convert fields to numbers to enforce schema
    const data = {
        store_id: String(storeId),
        timestamp: admin.firestore.Timestamp.fromDate(timestamp),
        revenue: Number(metrics.revenue || 0),
        orders: Number(metrics.orders || 0),
        visitors: Number(metrics.visitors || 0),
        conversion_rate: Number(metrics.conversion_rate || 0)
    };

    await db.collection("store_metrics").doc(docId).set(data, { merge: true });
}

/**
 * Retrieves the store metrics for the last N hours.
 * 
 * @param {string} storeId - Unique identifier for the store.
 * @param {number} hours - Number of hours to look back (default 24).
 * @returns {Promise<Array>} List of metric documents.
 */
async function getRecentStoreMetrics(storeId, hours = 24) {
    if (!storeId) {
        throw new Error("storeId is required to query metrics.");
    }

    const db = admin.firestore();
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    const snapshot = await db.collection("store_metrics")
        .where("store_id", "==", String(storeId))
        .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(cutoffTime))
        .orderBy("timestamp", "asc")
        .get();

    const results = [];
    snapshot.forEach(doc => {
        results.push({ id: doc.id, ...doc.data() });
    });

    return results;
}

module.exports = {
    saveStoreMetrics,
    getRecentStoreMetrics
};
