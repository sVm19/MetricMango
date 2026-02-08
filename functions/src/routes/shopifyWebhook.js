const express = require("express");
const crypto = require("crypto");
const admin = require("firebase-admin");
const { saveOrderFromShopify } = require("../services/orderService");
const { getShopifyConfig } = require("../utils/runtimeConfig");
const { ensureStoreOnboarding } = require("../services/storeOnboardingService");

const router = express.Router();

function verifyShopifyHmac(req) {
  // Prefer Firebase Functions config; fall back to env for local development.
  const secret = getShopifyConfig().webhookSecret;
  if (!secret) {
    // TODO: Consider failing startup if webhook secret is missing.
    throw new Error("Missing SHOPIFY_WEBHOOK_SECRET");
  }

  const hmacHeader = req.get("x-shopify-hmac-sha256") || "";
  const bodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");

  const digest = crypto
    .createHmac("sha256", secret)
    .update(bodyBuffer)
    .digest("base64");

  // TODO: Keep timing-safe comparison to avoid subtle signature leaks.
  const hmacBuffer = Buffer.from(hmacHeader, "utf8");
  const digestBuffer = Buffer.from(digest, "utf8");
  if (hmacBuffer.length !== digestBuffer.length) return false;
  return crypto.timingSafeEqual(hmacBuffer, digestBuffer);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidNumber(value) {
  return Number.isFinite(value) && value >= 0;
}

function getShopifyCountry(payload) {
  // Prefer Shopify store country if present; fallback to shipping/billing country.
  return (
    payload?.shop_country_code ||
    payload?.shop_country ||
    payload?.shipping_address?.country_code ||
    payload?.billing_address?.country_code ||
    payload?.customer?.default_address?.country_code ||
    ""
  );
}

function getUserSelectedCountry(req, payload) {
  // Fallback for user-selected country during onboarding.
  return (
    req.get("x-store-country") ||
    req.query.country ||
    payload?.store_country ||
    payload?.country ||
    ""
  );
}

router.post("/order-created", async (req, res) => {
  try {
    // TODO: Consider supporting per-store webhook secrets if multi-tenant needs grow.
    const isValid = verifyShopifyHmac(req);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    let payload;
    try {
      // Raw body is required for HMAC; parse after verification.
      payload = JSON.parse(req.body.toString("utf8"));
    } catch (parseError) {
      return res.status(400).json({ error: "Invalid JSON payload" });
    }

    const storeId = req.get("x-store-id") || req.query.storeId || payload.store_id;
    if (!storeId) {
      return res.status(400).json({ error: "Missing storeId" });
    }

    // TODO: Add retry/backoff handling for transient Firestore failures.
    // Onboarding: detect country from Shopify (preferred) or user-selected fallback.
    // Decide billing provider once at store creation (frontend cannot override later).
    await ensureStoreOnboarding({
      storeId,
      shopCountry: getShopifyCountry(payload),
      userCountry: getUserSelectedCountry(req, payload)
    });

    const orderId = String(payload.id || payload.order_id || "").trim();
    if (!orderId) {
      return res.status(400).json({ error: "Missing orderId" });
    }

    const lineItems = Array.isArray(payload.line_items) ? payload.line_items : [];
    if (!lineItems.length) {
      return res.status(400).json({ error: "Missing line items" });
    }

    for (const item of lineItems) {
      const productId = String(item.product_id || item.sku || item.id || "").trim();
      const quantity = Number(item.quantity);
      const price = Number(item.price);

      if (!isNonEmptyString(productId)) {
        return res.status(400).json({ error: "Missing productId in line item" });
      }
      if (!isValidNumber(quantity)) {
        return res.status(400).json({ error: "Invalid quantity in line item" });
      }
      if (!isValidNumber(price)) {
        return res.status(400).json({ error: "Invalid price in line item" });
      }
    }

    const result = await saveOrderFromShopify(storeId, payload);
    const now = admin.firestore.Timestamp.now();
    await admin.firestore().collection("stores").doc(String(storeId)).set({
      shopifyWebhookStatus: "active",
      shopifyInstallStatus: "connected",
      shopifyConnectedAt: now,
      lastOrderSyncedAt: now
    }, { merge: true });

    if (result.duplicate) {
      console.log("Duplicate order webhook ignored:", result.orderId);
      return res.status(200).json({ ok: true, duplicate: true });
    }
    console.log("Order processed:", result.orderId);
    return res.status(200).json({ ok: true, result });
  } catch (error) {
    console.error("Shopify webhook error:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

module.exports = router;
