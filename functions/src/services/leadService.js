const admin = require("firebase-admin");
const { sendEmail } = require("./emailService");

async function processNewLead(storeName, email) {
    if (!storeName || !email) {
        throw new Error("Store name and email are required");
    }

    const db = admin.firestore();

    // 1. Save to Firestore
    await db.collection("leads").add({
        storeName,
        email,
        createdAt: admin.firestore.Timestamp.now(),
        source: "landing_page_health_check"
    });

    // 2. Send the asset to the user
    const subject = "Your Free Inventory Health Check Guide";
    const text = `Hi there,\n\nThanks for requesting the Inventory Health Check for ${storeName}!\n\nHere are 3 quick steps to identifying capital tied up in slow-moving stock:\n1. Identify products with >90 days of inventory.\n2. Calculate the holding cost for these items.\n3. Consider bundling or discounting to free up cash.\n\nWant Metric Mango to do this automatically for you? Start your free 7-day trial at https://metricmango.store to connect your store and get live restock suggestions.\n\nCheers,\nThe Metric Mango Team`;

    await sendEmail({
        to: email,
        subject,
        text
    });

    return { success: true };
}

module.exports = {
    processNewLead
};
