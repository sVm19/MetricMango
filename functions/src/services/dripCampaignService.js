const admin = require("firebase-admin");
const { sendEmail } = require("./emailService");

// Number of milliseconds in a day
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// --- Pure Functions ---

/**
 * Calculates the number of days elapsed since a given start timestamp.
 * @param {number} startMs The timestamp in milliseconds when the trial started.
 * @param {number} nowMs The current timestamp in milliseconds.
 * @returns {number} The floored number of days elapsed.
 */
function calculateDaysSinceStart(startMs, nowMs) {
    if (typeof startMs !== 'number' || typeof nowMs !== 'number') return -1;
    return Math.floor((nowMs - startMs) / MS_PER_DAY);
}

/**
 * Returns the email template for a specific day, or null if no email is configured.
 * @param {number} day The day of the trial (e.g., 1, 3, 5, 6).
 * @param {object} store The store object containing name and other details.
 * @returns {object|null} The template object with subject, text, and key, or null.
 */
function getEmailTemplateForDay(day, store) {
    const storeName = store?.name || "Store Owner";
    const url = "https://metricmango.store";

    switch (day) {
        case 1:
            return {
                subject: "Welcome to Metric Mango - Let's grow your inventory",
                text: `Hi there,\n\nWelcome to Metric Mango! We're thrilled to have you on board during your 7-day free trial.\n\nTo get the most out of our platform, make sure to check out your Dashboard and see your live Restock Suggestions.\n\nGet started here: ${url}\n\nCheers,\nThe Metric Mango Team`,
                key: "day1"
            };
        case 3:
            return {
                subject: "Tip: Never run out of your bestsellers",
                text: `Hi ${storeName},\n\nDid you know you can customize the lead time for your Restock Suggestions? Head over to the Dashboard to adjust how many days of buffer you want before you restock.\n\nTry it now: ${url}\n\nCheers,\nThe Metric Mango Team`,
                key: "day3"
            };
        case 5:
            return {
                subject: "Discover powerful Forecasting",
                text: `Hi ${storeName},\n\nWe know managing cash flow is critical. Have you tried our AI-driven Forecasting tool yet? It analyzes your past sales to predict what you'll need next month.\n\nExplore forecasting: ${url}\n\nCheers,\nThe Metric Mango Team`,
                key: "day5"
            };
        case 6:
            return {
                subject: "Action Required: Your Metric Mango trial ends tomorrow",
                text: `Hi ${storeName},\n\nYour 7-day free trial of Metric Mango ends tomorrow. To ensure you don't lose access to your Restock Suggestions and Forecasting, please upgrade your plan today.\n\nUpgrade here: ${url}/payment\n\nThanks for trying Metric Mango,\nThe Metric Mango Team`,
                key: "day6"
            };
        default:
            return null;
    }
}

/**
 * Determines what the nextDripAt timestamp should be based on the current day.
 * If the trial is over (day > 6), returns null to stop querying this store.
 * @param {number} currentDay The day of the email just sent.
 * @param {number} startMs The timestamp the trial started.
 * @returns {number|null} The timestamp in milliseconds for the next drip check, or null.
 */
function calculateNextDripAt(currentDay, startMs) {
    let nextDayTarget = null;
    if (currentDay === 1 || currentDay < 3) nextDayTarget = 3;
    else if (currentDay === 3 || currentDay < 5) nextDayTarget = 5;
    else if (currentDay === 5) nextDayTarget = 6;

    if (nextDayTarget === null) return null;

    return startMs + (nextDayTarget * MS_PER_DAY);
}

// --- Side-Effect Functions ---

async function runDailyDripCampaign() {
    console.info("Starting daily email drip campaign...");
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const nowMs = now.toMillis();

    // Query stores where plan is trial and it's time (or past time) to evaluate them for a drip email.
    const storesSnap = await db.collection("stores")
        .where("plan", "==", "trial")
        .where("nextDripAt", "<=", now)
        .get();

    let sentCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const doc of storesSnap.docs) {
        const storeId = doc.id;
        const store = doc.data();

        // Idempotency: skip if unsubscribed
        if (store.unsubscribed === true) {
            skippedCount++;
            // Even if unsubscribed, we should probably update nextDripAt so we stop pulling them,
            // or we just let them age out. Opting to clear nextDripAt to optimize future queries.
            await safeUpdateStore(db, storeId, { nextDripAt: admin.firestore.FieldValue.delete() });
            continue;
        }

        const recipient = store.alertEmail || store.email;
        if (!recipient) {
            skippedCount++;
            continue;
        }

        // Determine when the trial started. Fallback to createdAt if trialStartAt is missing.
        const startTimestamp = store.trialStartAt || store.createdAt;
        if (!startTimestamp) {
            skippedCount++;
            continue;
        }
        const startMs = startTimestamp.toMillis();
        const daysSince = calculateDaysSinceStart(startMs, nowMs);

        // Get the template for the current day
        const template = getEmailTemplateForDay(daysSince, store);

        // Check if we've already sent this specific email (Idempotency check)
        const dripHistory = store.dripEmailSent || {};
        const alreadySent = template && dripHistory[template.key] === true;

        if (!template || alreadySent) {
            // If we don't have an email for today, or it's already sent, we just need to schedule the next check.
            // This happens if the cron job runs late and passes multiple days, or runs twice on the same day.
            const nextMs = calculateNextDripAt(daysSince, startMs);
            const nextDripUpdate = nextMs ? admin.firestore.Timestamp.fromMillis(nextMs) : admin.firestore.FieldValue.delete();

            await safeUpdateStore(db, storeId, { nextDripAt: nextDripUpdate });
            skippedCount++;
            continue;
        }

        // Attempt to send the email
        try {
            await sendEmail({
                to: recipient,
                subject: template.subject,
                text: template.text
            });

            // Calculate next scheduled check
            const nextMs = calculateNextDripAt(daysSince, startMs);
            const nextDripUpdate = nextMs ? admin.firestore.Timestamp.fromMillis(nextMs) : admin.firestore.FieldValue.delete();

            // Update the record: Set email sent to true, update nextDripAt
            await db.collection("stores").doc(storeId).set({
                dripEmailSent: {
                    ...dripHistory,
                    [template.key]: true
                },
                nextDripAt: nextDripUpdate
            }, { merge: true });

            sentCount++;
            console.info(`Sent ${template.key} email to store ${storeId}`);
        } catch (error) {
            errorCount++;
            console.error(`Failed to send ${template.key} email to store ${storeId}:`, error);

            // Log the error to a dedicated collection. We do not block the loop.
            await db.collection("dripErrors").add({
                storeId,
                emailKey: template.key,
                error: error.message || String(error),
                createdAt: admin.firestore.Timestamp.now()
            }).catch(err => {
                console.error(`Also failed to log error to dripErrors collection for store ${storeId}:`, err);
            });
        }
    }

    console.info(`Finished drip campaign. Sent: ${sentCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);
    return { sent: sentCount, skipped: skippedCount, errors: errorCount };
}

/**
 * Helper to safely update a store without throwing.
 */
async function safeUpdateStore(db, storeId, data) {
    try {
        await db.collection("stores").doc(storeId).set(data, { merge: true });
    } catch (err) {
        console.warn(`Failed to safely update store ${storeId}:`, err);
    }
}

module.exports = {
    runDailyDripCampaign,
    // Export pure functions for testing
    calculateDaysSinceStart,
    getEmailTemplateForDay,
    calculateNextDripAt
};
