const express = require("express");
const crypto = require("crypto");
const admin = require("firebase-admin");
const { mapLemonSqueezyEventToPlan } = require("../services/lemonSqueezyService");
const { getBillingConfig } = require("../utils/runtimeConfig");
const { normalizeBillingProvider } = require("../services/billingProviderService");
const { evaluateProviderGuard } = require("../services/billingGuardService");

const router = express.Router();

function verifyLemonSqueezySignature(req) {
  // Prefer Firebase Functions config; fall back to env for local development.
  const secret = getBillingConfig().lemonSqueezy.webhookSecret;
  if (!secret) {
    // TODO: Consider failing startup if webhook secret is missing.
    throw new Error("Missing LEMON_SQUEEZY_WEBHOOK_SECRET");
  }

  const signature = req.get("x-signature") || "";
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

function getStoreIdFromPayload(payload) {
  const custom = payload?.meta?.custom_data || {};
  return custom.storeId || custom.store_id || "";
}

router.post("/", async (req, res) => {
  try {
    const globalGuard = evaluateProviderGuard({
      provider: "lemonsqueezy",
      action: "webhook",
      requireStoreProviderMatch: false
    });
    if (!globalGuard.ok) {
      console.warn("Lemon Squeezy webhook guard blocked processing", {
        reason: globalGuard.reason
      });
      if (globalGuard.reason === "provider_disabled") {
        return res.status(200).json({ ok: true, ignored: true, reason: "provider_disabled" });
      }
      return res.status(Number(globalGuard.statusCode) || 400).json({ error: "Webhook guard failed" });
    }

    const isValid = verifyLemonSqueezySignature(req);
    if (!isValid) {
      console.warn("Lemon Squeezy webhook signature verification failed");
      return res.status(401).json({ error: "Invalid webhook signature" });
    }
    // TODO: Add replay protection (timestamp + nonce) if Lemon Squeezy supports it.

    let payload;
    try {
      payload = JSON.parse(req.body.toString("utf8"));
    } catch (parseError) {
      return res.status(400).json({ error: "Invalid JSON payload" });
    }

    const eventName = payload?.meta?.event_name || payload?.meta?.event || "";
    const storeId = getStoreIdFromPayload(payload);
    console.log("Lemon Squeezy webhook received:", {
      eventName: eventName || "unknown",
      storeId: storeId || "missing"
    });

    // Only process subscription lifecycle events; ignore unknowns safely.
    const plan = mapLemonSqueezyEventToPlan(eventName);
    if (!plan) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    if (!storeId) {
      console.error("Lemon Squeezy webhook error: missing storeId in custom_data", {
        eventName: eventName || "unknown"
      });
      return res.status(400).json({ error: "Missing storeId in custom_data" });
    }

    // Security: route billing updates based on the provider chosen at onboarding.
    const storeSnap = await admin.firestore().collection("stores").doc(String(storeId)).get();
    if (!storeSnap.exists) {
      console.error("Lemon Squeezy webhook error: store not found", { storeId });
      return res.status(404).json({ error: "Store not found" });
    }
    const store = storeSnap.data() || {};
    const billingProvider = normalizeBillingProvider(store.billingProvider);
    if (billingProvider && billingProvider !== "lemonsqueezy") {
      // Fail safely: ignore Lemon Squeezy events for Razorpay stores.
      return res.status(200).json({ ok: true, ignored: true });
    }

    const storeGuard = evaluateProviderGuard({
      provider: "lemonsqueezy",
      store,
      action: "webhook",
      requireStoreProviderMatch: true
    });
    if (!storeGuard.ok) {
      console.warn("Lemon Squeezy webhook store guard blocked processing", {
        storeId,
        reason: storeGuard.reason
      });
      if (storeGuard.reason === "store_provider_mismatch") {
        return res.status(200).json({ ok: true, ignored: true, reason: "store_provider_mismatch" });
      }
      return res.status(Number(storeGuard.statusCode) || 400).json({ error: "Webhook guard failed" });
    }

    if (String(store.plan || "").toLowerCase() === plan) {
      console.log("Lemon Squeezy webhook duplicate event ignored (idempotent)", {
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
    console.error("Lemon Squeezy webhook error:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

module.exports = router;
