const express = require("express");
const crypto = require("crypto");
const admin = require("firebase-admin");
const { getBillingConfig } = require("../utils/runtimeConfig");
const { normalizeBillingProvider } = require("../services/billingProviderService");
const { evaluateProviderGuard } = require("../services/billingGuardService");

const router = express.Router();

function verifyRazorpaySignature(req) {
  // Use Razorpay key secret as requested (shared secret for webhook verification).
  const secret = getBillingConfig().razorpay.keySecret;
  if (!secret) {
    // TODO: Consider failing startup if webhook secret is missing.
    throw new Error("Missing RAZORPAY_KEY_SECRET");
  }

  const signature = req.get("x-razorpay-signature") || "";
  const bodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");

  const digest = crypto
    .createHmac("sha256", secret)
    .update(bodyBuffer)
    .digest("hex");

  const signatureBuffer = Buffer.from(signature, "utf8");
  const digestBuffer = Buffer.from(digest, "utf8");
  if (signatureBuffer.length !== digestBuffer.length) return false;
  return crypto.timingSafeEqual(signatureBuffer, digestBuffer);
}

async function resolveStoreId(payload) {
  const notesStoreId = payload?.payload?.subscription?.entity?.notes?.storeId
    || payload?.payload?.subscription?.entity?.notes?.store_id;
  if (notesStoreId) return String(notesStoreId);

  const subscriptionId = payload?.payload?.subscription?.entity?.id;
  if (!subscriptionId) return "";

  const snap = await admin.firestore()
    .collection("stores")
    .where("razorpaySubscriptionId", "==", subscriptionId)
    .limit(1)
    .get();
  if (snap.empty) return "";
  return snap.docs[0].id;
}

router.post("/", async (req, res) => {
  try {
    const globalGuard = evaluateProviderGuard({
      provider: "razorpay",
      action: "webhook",
      requireStoreProviderMatch: false
    });
    if (!globalGuard.ok) {
      console.warn("Razorpay webhook guard blocked processing", {
        reason: globalGuard.reason
      });
      if (globalGuard.reason === "provider_disabled") {
        return res.status(200).json({ ok: true, ignored: true, reason: "provider_disabled" });
      }
      return res.status(Number(globalGuard.statusCode) || 400).json({ error: "Webhook guard failed" });
    }

    const isValid = verifyRazorpaySignature(req);
    if (!isValid) {
      console.warn("Razorpay webhook signature verification failed");
      return res.status(401).json({ error: "Invalid webhook signature" });
    }
    // TODO: Add replay protection (timestamp + nonce) if Razorpay supports it.

    let payload;
    try {
      payload = JSON.parse(req.body.toString("utf8"));
    } catch (parseError) {
      return res.status(400).json({ error: "Invalid JSON payload" });
    }

    const eventName = payload?.event || "";
    console.log("Razorpay webhook received:", {
      eventName: eventName || "unknown"
    });

    // Fail safely on unknown events.
    if (!["subscription_activated", "subscription_cancelled", "subscription_expired"].includes(eventName)) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const storeId = await resolveStoreId(payload);
    if (!storeId) {
      console.error("Razorpay webhook error: missing storeId for subscription", {
        eventName: eventName || "unknown"
      });
      return res.status(400).json({ error: "Missing storeId for subscription" });
    }

    const storeSnap = await admin.firestore().collection("stores").doc(String(storeId)).get();
    if (!storeSnap.exists) {
      console.error("Razorpay webhook error: store not found", { storeId });
      return res.status(404).json({ error: "Store not found" });
    }

    const store = storeSnap.data() || {};
    const billingProvider = normalizeBillingProvider(store.billingProvider);
    if (billingProvider && billingProvider !== "razorpay") {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const storeGuard = evaluateProviderGuard({
      provider: "razorpay",
      store,
      action: "webhook",
      requireStoreProviderMatch: true
    });
    if (!storeGuard.ok) {
      console.warn("Razorpay webhook store guard blocked processing", {
        storeId,
        reason: storeGuard.reason
      });
      if (storeGuard.reason === "store_provider_mismatch") {
        return res.status(200).json({ ok: true, ignored: true, reason: "store_provider_mismatch" });
      }
      return res.status(Number(storeGuard.statusCode) || 400).json({ error: "Webhook guard failed" });
    }

    const plan = eventName === "subscription_activated" ? "active" : "inactive";

    if (String(store.plan || "").toLowerCase() === plan) {
      console.log("Razorpay webhook duplicate event ignored (idempotent)", {
        storeId,
        plan,
        eventName: eventName || "unknown"
      });
      return res.status(200).json({ ok: true, idempotent: true });
    }

    // Billing abstraction: webhooks only update `stores.plan`.
    // Core feature access stays provider-agnostic (subscriptionGate uses `plan` only).
    await admin.firestore().collection("stores").doc(String(storeId)).set({
      plan
    }, { merge: true });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Razorpay webhook error:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

module.exports = router;
