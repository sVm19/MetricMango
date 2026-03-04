/**
 * PayPal Webhook Handler
 * -----------------------
 * Processes PayPal subscription lifecycle events.
 * Follows the same pattern as lemonSqueezyWebhook.js and razorpayWebhook.js:
 *   1. Provider guard check
 *   2. Verify webhook signature (via PayPal API)
 *   3. Parse event type → map to internal plan status
 *   4. Resolve storeId from custom_id
 *   5. Update stores.plan (same field used by all providers)
 *
 * This handler does NOT modify any Lemon Squeezy or Razorpay logic.
 */

const express = require("express");
const admin = require("firebase-admin");
const { verifyPayPalWebhookSignature, mapPayPalEventToPlan } = require("../services/paypalService");
const { normalizeBillingProvider } = require("../services/billingProviderService");
const { evaluateProviderGuard } = require("../services/billingGuardService");

const router = express.Router();

/**
 * Extract storeId from PayPal webhook payload.
 * PayPal sends custom_id in the subscription resource — this is set during checkout.
 */
function getStoreIdFromPayload(payload) {
    // PayPal nests the subscription resource under `resource`.
    const resource = payload?.resource || {};
    // custom_id is set when creating the subscription (carries our internal storeId).
    return String(resource.custom_id || "").trim();
}

/**
 * Extract PayPal subscription ID from webhook payload.
 */
function getSubscriptionIdFromPayload(payload) {
    const resource = payload?.resource || {};
    // For subscription events, the ID is on the resource itself.
    // For sale events, it may be in billing_agreement_id.
    return String(resource.id || resource.billing_agreement_id || "").trim();
}

router.post("/", async (req, res) => {
    try {
        // --- Step 1: Global provider guard ---
        const globalGuard = evaluateProviderGuard({
            provider: "paypal",
            action: "webhook",
            requireStoreProviderMatch: false
        });
        if (!globalGuard.ok) {
            console.warn("PayPal webhook guard blocked processing", {
                reason: globalGuard.reason
            });
            if (globalGuard.reason === "provider_disabled") {
                return res.status(200).json({ ok: true, ignored: true, reason: "provider_disabled" });
            }
            return res.status(Number(globalGuard.statusCode) || 400).json({ error: "Webhook guard failed" });
        }

        // --- Step 2: Verify PayPal webhook signature ---
        const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
        let isValid = false;
        try {
            isValid = await verifyPayPalWebhookSignature({
                headers: {
                    "paypal-auth-algo": req.get("paypal-auth-algo") || "",
                    "paypal-cert-url": req.get("paypal-cert-url") || "",
                    "paypal-transmission-id": req.get("paypal-transmission-id") || "",
                    "paypal-transmission-sig": req.get("paypal-transmission-sig") || "",
                    "paypal-transmission-time": req.get("paypal-transmission-time") || ""
                },
                rawBody
            });
        } catch (verifyError) {
            console.error("PayPal webhook signature verification error:", verifyError?.message || verifyError);
            return res.status(401).json({ error: "Webhook signature verification failed" });
        }
        if (!isValid) {
            console.warn("PayPal webhook signature verification failed");
            return res.status(401).json({ error: "Invalid webhook signature" });
        }

        // --- Step 3: Parse event ---
        let payload;
        try {
            payload = JSON.parse(rawBody);
        } catch (parseError) {
            return res.status(400).json({ error: "Invalid JSON payload" });
        }

        const eventType = payload?.event_type || "";
        const storeId = getStoreIdFromPayload(payload);
        const subscriptionId = getSubscriptionIdFromPayload(payload);

        console.log("PayPal webhook received:", {
            eventType: eventType || "unknown",
            storeId: storeId || "missing",
            subscriptionId: subscriptionId || "unknown"
        });

        // --- Step 4: Map event to plan ---
        const plan = mapPayPalEventToPlan(eventType);
        if (!plan) {
            // Unhandled event type — acknowledge safely.
            console.log("PayPal webhook event ignored (not a plan-changing event):", { eventType });
            return res.status(200).json({ ok: true, ignored: true });
        }

        if (!storeId) {
            console.error("PayPal webhook error: missing storeId (custom_id) in payload", {
                eventType,
                subscriptionId
            });
            return res.status(400).json({ error: "Missing storeId (custom_id) in subscription" });
        }

        // --- Step 5: Resolve store and verify provider ---
        const storeSnap = await admin.firestore().collection("stores").doc(String(storeId)).get();
        if (!storeSnap.exists) {
            console.error("PayPal webhook error: store not found", { storeId });
            return res.status(404).json({ error: "Store not found" });
        }

        const store = storeSnap.data() || {};
        const billingProvider = normalizeBillingProvider(store.billingProvider);

        // Allow PayPal webhooks for stores with "paypal" or no provider set yet.
        // Reject if the store explicitly uses a different provider (e.g. razorpay).
        if (billingProvider && billingProvider !== "paypal" && billingProvider !== "lemonsqueezy") {
            console.log("PayPal webhook ignored: store uses different provider", {
                storeId,
                billingProvider
            });
            return res.status(200).json({ ok: true, ignored: true });
        }

        // Idempotency: skip if plan is already at the target value.
        if (String(store.plan || "").toLowerCase() === plan) {
            console.log("PayPal webhook duplicate event ignored (idempotent)", {
                storeId,
                plan,
                eventType
            });
            return res.status(200).json({ ok: true, idempotent: true });
        }

        // --- Step 6: Update store subscription ---
        // PayPal webhook handler: updates plan + PayPal-specific subscription metadata.
        // This converges with Lemon Squeezy/Razorpay on `stores.plan` for access control.
        const now = admin.firestore.Timestamp.now();
        const updatePayload = {
            plan,
            // Track which payment provider activated/deactivated the subscription.
            paymentProvider: "paypal",
            providerSubscriptionId: subscriptionId,
            paypalSubscriptionId: subscriptionId,
            paypalStatus: String(payload?.resource?.status || eventType).toUpperCase(),
            paypalLastWebhookAt: now
        };

        // Extract next billing date if available (from subscription resource).
        const nextBillingTime = payload?.resource?.billing_info?.next_billing_time;
        if (nextBillingTime) {
            try {
                updatePayload.nextBillingDate = admin.firestore.Timestamp.fromDate(new Date(nextBillingTime));
            } catch {
                // Non-critical: skip if date parsing fails.
            }
        }

        // If activating, also set the billing provider on the store for future guard checks.
        if (plan === "active") {
            updatePayload.billingProvider = "paypal";
        }

        await admin.firestore().collection("stores").doc(String(storeId)).set(updatePayload, { merge: true });

        console.info("PayPal webhook processed successfully", {
            storeId,
            plan,
            eventType,
            subscriptionId
        });

        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error("PayPal webhook error:", error);
        return res.status(500).json({ error: "Webhook processing failed" });
    }
});

module.exports = router;
