const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const shopifyWebhook = require("./routes/shopifyWebhook");
const lemonSqueezyWebhook = require("./routes/lemonSqueezyWebhook");
const razorpayWebhook = require("./routes/razorpayWebhook");
const dashboard = require("./routes/dashboard");
const forecast = require("./routes/forecast");
const { computeRestockSuggestions } = require("./services/restockService");
const { sendLowStockAlertsForStore } = require("./services/lowStockAlertService");
const { decideBillingProvider, normalizeBillingProvider } = require("./services/billingProviderService");
const { evaluateProviderGuard, getEnabledProviders } = require("./services/billingGuardService");
const { createRazorpaySubscription } = require("./services/razorpayService");
const { getBillingConfig } = require("./utils/runtimeConfig");
const { createLemonSqueezyCheckout } = require("./services/lemonSqueezyService");
const { PRICING } = require("./config/pricing");
const { getShopifyConfig, getOnboardingConfig } = require("./utils/runtimeConfig");

admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(cors({ origin: true }));

function httpsOnly(req, res, next) {
  // Allow HTTP for local development (localhost/127.0.0.1).
  const host = req.get("host") || "";
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
  if (isLocal) return next();

  // Enforce HTTPS in production to avoid insecure data transmission.
  const isProduction = process.env.NODE_ENV === "production";
  const forwardedProto = req.get("x-forwarded-proto") || "";
  const isHttps = req.secure || forwardedProto === "https";
  if (isProduction && !isHttps) {
    return res.status(400).json({ error: "HTTPS required" });
  }
  return next();
}

// Apply HTTPS checks before other middleware.
app.use(httpsOnly);

function getApiKey(req) {
  const authHeader = req.get("authorization") || "";
  if (!authHeader) return null;
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim() || null;
  }
  return authHeader.trim() || null;
}

function isLikelyJwt(token) {
  return typeof token === "string" && token.split(".").length === 3;
}

async function getFirebaseUserFromRequest(req) {
  const token = getApiKey(req);
  if (!token || !isLikelyJwt(token)) {
    return null;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return {
      uid: String(decoded.uid || ""),
      email: String(decoded.email || "").trim().toLowerCase()
    };
  } catch (error) {
    return null;
  }
}

async function requireFirebaseUser(req, res, next) {
  try {
    const firebaseUser = await getFirebaseUserFromRequest(req);
    if (!firebaseUser?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.firebaseUser = firebaseUser;
    return next();
  } catch (error) {
    console.error("Firebase auth verification error:", error);
    return res.status(401).json({ error: "Unauthorized" });
  }
}

function defaultFeatures() {
  return {
    emailAlerts: true,
    csvExport: true,
    forecasting: true
  };
}

function normalizeCountryCode(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  // Accept country inputs like "IN" or locale-like "en-IN".
  if (raw.includes("-")) {
    const parts = raw.split("-");
    return String(parts[parts.length - 1] || "").slice(0, 2);
  }
  return raw.slice(0, 2);
}

function resolveCountryFromRequest(req) {
  return normalizeCountryCode(
    req.body?.country
    || req.get("x-country")
    || req.get("cf-ipcountry")
    || req.get("x-appengine-country")
  );
}

function getStoreCreatedAtMillis(doc) {
  const createdAt = doc.data()?.createdAt;
  if (createdAt?.toMillis) return createdAt.toMillis();
  if (doc.updateTime?.toMillis) return doc.updateTime.toMillis();
  return 0;
}

async function getOwnedStores(uid) {
  const ownerUserId = String(uid);
  const [ownerSnap, legacySnap] = await Promise.all([
    db.collection("stores").where("ownerUserId", "==", ownerUserId).get(),
    db.collection("stores").where("ownerUid", "==", ownerUserId).get()
  ]);

  const byId = new Map();
  ownerSnap.docs.forEach(doc => byId.set(doc.id, doc));
  legacySnap.docs.forEach(doc => byId.set(doc.id, doc));
  return Array.from(byId.values());
}

function pickMostRecentStore(uid, storeDocs) {
  if (!storeDocs.length) return null;
  const sorted = [...storeDocs].sort((a, b) => getStoreCreatedAtMillis(b) - getStoreCreatedAtMillis(a));
  if (sorted.length > 1) {
    console.warn("Multiple stores found for user. Using most recent store.", {
      userId: String(uid),
      storeIds: sorted.map(doc => doc.id)
    });
  }
  return sorted[0];
}

async function createStoreForUser({ uid, email, country }) {
  const userId = String(uid);
  const userRef = db.collection("users").doc(userId);
  const storeRef = db.collection("stores").doc();
  const storeId = String(storeRef.id);
  const now = new Date();
  const countryCode = normalizeCountryCode(country);
  const billingProvider = decideBillingProvider({
    country: countryCode,
    shopCountry: countryCode
  });
  const fallbackName = email ? String(email).split("@")[0] : "Store";

  await db.runTransaction(async tx => {
    const [userSnap, existingStoresSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(db.collection("stores").where("ownerUserId", "==", userId).limit(1))
    ]);
    const userData = userSnap.data() || {};

    if (!existingStoresSnap.empty) {
      const existingStoreId = String(existingStoresSnap.docs[0].id);
      const userPayload = {
        storeId: existingStoreId,
        updatedAt: now
      };
      if (!userData.createdAt) userPayload.createdAt = now;
      if (typeof userData.onboardingCompleted !== "boolean") userPayload.onboardingCompleted = false;
      if (email) userPayload.email = String(email).trim().toLowerCase();

      tx.set(userRef, {
        ...userPayload
      }, { merge: true });
      return;
    }

    tx.set(storeRef, {
      name: fallbackName,
      email: email || "",
      alertEmail: email || "",
      ownerUserId: userId,
      plan: "trial",
      trialStartAt: now,
      createdAt: now,
      billingProvider,
      country: countryCode || "",
      shopCountry: countryCode || "",
      onboardingCompleted: false,
      features: defaultFeatures()
    }, { merge: true });

    const userPayload = {
      storeId,
      createdAt: userData.createdAt || now,
      updatedAt: now
    };
    if (typeof userData.onboardingCompleted !== "boolean") userPayload.onboardingCompleted = false;
    if (email) userPayload.email = String(email).trim().toLowerCase();

    tx.set(userRef, { ...userPayload }, { merge: true });
  });

  const storesAfterCreate = await getOwnedStores(userId);
  const selected = pickMostRecentStore(userId, storesAfterCreate);
  if (!selected) {
    throw new Error("Failed to create store for user");
  }
  return String(selected.id);
}

async function ensureUserStoreMapping({ uid, email, country }) {
  const userId = String(uid);
  const userRef = db.collection("users").doc(userId);
  const ownedStores = await getOwnedStores(userId);
  const selectedStore = pickMostRecentStore(userId, ownedStores);
  if (selectedStore) {
    const selectedStoreId = String(selectedStore.id);
    await db.runTransaction(async tx => {
      const now = new Date();
      const userSnap = await tx.get(userRef);
      const userData = userSnap.data() || {};
      const userPayload = {
        storeId: selectedStoreId,
        updatedAt: now
      };
      if (!userData.createdAt) userPayload.createdAt = now;
      if (typeof userData.onboardingCompleted !== "boolean") userPayload.onboardingCompleted = false;
      if (email) userPayload.email = String(email).trim().toLowerCase();
      tx.set(userRef, { ...userPayload }, { merge: true });
    });
    await db.collection("stores").doc(selectedStoreId).set({
      ownerUserId: userId
    }, { merge: true });
    return { storeId: selectedStoreId, created: false };
  }

  // Recover mapping for legacy users to avoid duplicate store creation.
  const legacyStoreSnap = await db.collection("stores")
    .where("ownerUserId", "==", userId)
    .limit(1)
    .get();
  if (!legacyStoreSnap.empty) {
    const existingStoreId = String(legacyStoreSnap.docs[0].id);
    await db.runTransaction(async tx => {
      const now = new Date();
      const userSnap = await tx.get(userRef);
      const userData = userSnap.data() || {};
      const userPayload = {
        storeId: existingStoreId,
        updatedAt: now
      };
      if (!userData.createdAt) userPayload.createdAt = now;
      if (typeof userData.onboardingCompleted !== "boolean") userPayload.onboardingCompleted = false;
      if (email) userPayload.email = String(email).trim().toLowerCase();
      tx.set(userRef, { ...userPayload }, { merge: true });
    });
    await db.collection("stores").doc(existingStoreId).set({
      ownerUserId: userId
    }, { merge: true });
    return { storeId: existingStoreId, created: false };
  }

  // Backward compatibility for old owner field name.
  const legacyOwnerUidSnap = await db.collection("stores")
    .where("ownerUid", "==", userId)
    .limit(1)
    .get();
  if (!legacyOwnerUidSnap.empty) {
    const normalizedStoreId = String(legacyOwnerUidSnap.docs[0].id);
    await db.collection("stores").doc(normalizedStoreId).set({
      ownerUserId: userId
    }, { merge: true });
    await db.runTransaction(async tx => {
      const now = new Date();
      const userSnap = await tx.get(userRef);
      const userData = userSnap.data() || {};
      const userPayload = {
        storeId: normalizedStoreId,
        updatedAt: now
      };
      if (!userData.createdAt) userPayload.createdAt = now;
      if (typeof userData.onboardingCompleted !== "boolean") userPayload.onboardingCompleted = false;
      if (email) userPayload.email = String(email).trim().toLowerCase();
      tx.set(userRef, { ...userPayload }, { merge: true });
    });
    return { storeId: normalizedStoreId, created: false };
  }

  const createdStoreId = await createStoreForUser({ uid: userId, email, country });
  return { storeId: createdStoreId, created: true };
}

async function resolveStoreIdForUser(uid, options = {}) {
  const userId = String(uid);
  const selectedStore = pickMostRecentStore(userId, await getOwnedStores(userId));
  if (selectedStore) {
    const resolvedStoreId = String(selectedStore.id);
    const userRef = db.collection("users").doc(userId);
    await db.runTransaction(async tx => {
      const now = new Date();
      const userSnap = await tx.get(userRef);
      const userData = userSnap.data() || {};
      const userPayload = {
        storeId: resolvedStoreId,
        updatedAt: now
      };
      if (!userData.createdAt) userPayload.createdAt = now;
      if (typeof userData.onboardingCompleted !== "boolean") userPayload.onboardingCompleted = false;
      if (options.email) userPayload.email = String(options.email).trim().toLowerCase();
      tx.set(userRef, { ...userPayload }, { merge: true });
    });
    return resolvedStoreId;
  }

  if (!options.autoCreate) {
    return "";
  }

  return createStoreForUser({
    uid: userId,
    email: options.email || "",
    country: options.country || ""
  });
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (stringValue.includes("\"") || stringValue.includes(",") || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
}

function toCsv(columns, rows) {
  const header = columns.join(",");
  const lines = rows.map(row => columns.map(col => escapeCsvValue(row[col])).join(","));
  return [header, ...lines].join("\n");
}

function createRateLimiter({ windowMs, max, keyFn }) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = keyFn(req);
    if (!key) {
      return res.status(401).json({ error: "Missing API key" });
    }

    const entry = buckets.get(key);
    if (!entry || now >= entry.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= max) {
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    entry.count += 1;
    return next();
  };
}

function getRateLimitKey(req) {
  return getApiKey(req) || req.ip || "unknown";
}

function getIpKey(req) {
  return req.ip || "unknown";
}

function requireFeature(store, flag) {
  const flags = store?.features || {};
  if (String(store?.plan || "") === "trial") return true;
  return flags[flag] !== false;
}

function getPricingForStore(store) {
  // Provider-agnostic pricing selection; do not hardcode prices in payment logic.
  const provider = normalizeBillingProvider(store?.billingProvider) || decideBillingProvider(store);
  const pricing = provider === "razorpay" ? PRICING.india : PRICING.global;
  return {
    billingProvider: provider,
    currency: pricing.currency,
    amount: pricing.amount,
    interval: "month",
    trialDays: 7
  };
}

const TRIAL_DAYS = 7;

function getTrialDates(store, now = new Date()) {
  const trialStartDate = store?.trialStartAt?.toDate ? store.trialStartAt.toDate() : null;
  if (!trialStartDate) {
    return { trialStartDate: null, trialEndDate: null };
  }
  const trialEndDate = new Date(trialStartDate.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  return { trialStartDate, trialEndDate };
}

function getTrialDaysLeftFromStore(store, now = new Date()) {
  const plan = String(store?.plan || "inactive");
  if (plan !== "trial") return 0;
  const { trialEndDate } = getTrialDates(store, now);
  if (!trialEndDate) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((trialEndDate.getTime() - now.getTime()) / msPerDay));
}

// TODO: Replace in-memory rate limiting with Firestore/Redis if multi-instance scaling is needed.
const apiRateLimit = createRateLimiter({ windowMs: 60 * 1000, max: 120, keyFn: getRateLimitKey });
// Stricter limit for webhook endpoints.
const webhookRateLimit = createRateLimiter({ windowMs: 60 * 1000, max: 30, keyFn: getIpKey });

function logTrialExpiryOnce(req, details = {}) {
  if (req._trialExpiryLogged) return;
  req._trialExpiryLogged = true;
  console.info("Trial expired access blocked", {
    storeId: req.storeId || null,
    path: req.path || "",
    ...details
  });
}

function logMappingFailure(req, details = {}) {
  console.warn("User-to-store mapping resolution failed", {
    userId: req.userId || null,
    path: req.path || "",
    ...details
  });
}

const UPGRADE_PROMPT = "Upgrade to Pro to unlock all features";
const PLAN_PRICING_MESSAGE = "One plan. ₹499 / $9 per month.";

function sendUpgradeRequired(res, { status = 402, error, message }) {
  return res.status(status).json({
    error,
    message,
    upgradeRequired: true,
    upgradeMessage: UPGRADE_PROMPT,
    pricingMessage: PLAN_PRICING_MESSAGE
  });
}

function sendTrialExpired(res) {
  return sendUpgradeRequired(res, {
    status: 402,
    error: "trial_expired",
    message: "Your 7-day free trial has ended"
  });
}

async function reconcileTrialExpiryOnAccess({ storeId, store, now = new Date() }) {
  const plan = String(store?.plan || "inactive");
  if (plan !== "trial") return store;

  const { trialStartDate, trialEndDate } = getTrialDates(store, now);
  const trialExpired = !trialStartDate || !trialEndDate || now > trialEndDate;
  if (!trialExpired) return store;

  // Request-time expiry keeps the system free-tier friendly without cron.
  // TODO: Add scheduled cleanup to proactively expire stale trial stores.
  const trialExpiredAt = store?.trialExpiredAt || admin.firestore.Timestamp.fromDate(now);
  await admin.firestore().collection("stores").doc(String(storeId)).set({
    plan: "inactive",
    trialExpiredAt
  }, { merge: true });

  return { ...store, plan: "inactive", trialExpiredAt };
}

async function apiKeyGate(req, res, next) {
  try {
    const firebaseUser = await getFirebaseUserFromRequest(req);
    if (firebaseUser?.uid) {
      req.userId = firebaseUser.uid;
      const mappedStoreId = await resolveStoreIdForUser(firebaseUser.uid, {
        autoCreate: true,
        email: firebaseUser.email,
        country: resolveCountryFromRequest(req)
      });
      if (!mappedStoreId) {
        logMappingFailure(req, { reason: "mapping_not_found_after_autocreate" });
        return res.status(403).json({ error: "missing_store_mapping" });
      }

      const storeDoc = await admin.firestore().collection("stores").doc(mappedStoreId).get();
      if (!storeDoc.exists) {
        logMappingFailure(req, { reason: "mapped_store_not_found", storeId: mappedStoreId });
        return res.status(404).json({ error: "Store not found" });
      }

      const storeData = storeDoc.data() || {};
      if (String(storeData.ownerUserId || "") !== String(firebaseUser.uid)) {
        logMappingFailure(req, {
          reason: "owner_mismatch",
          storeId: mappedStoreId,
          ownerUserId: String(storeData.ownerUserId || "")
        });
        return res.status(403).json({ error: "store_access_denied" });
      }

      req.storeId = String(mappedStoreId);
      req.store = storeData;
    } else {
      const apiKey = getApiKey(req);
      if (!apiKey) {
        return res.status(401).json({ error: "Missing API key" });
      }

      const storeSnap = await admin.firestore()
        .collection("stores")
        .where("apiKey", "==", apiKey)
        .limit(1)
        .get();

      if (storeSnap.empty) {
        return res.status(401).json({ error: "Invalid API key" });
      }

      const storeDoc = storeSnap.docs[0];
      req.storeId = String(storeDoc.id);
      const store = storeDoc.data();

      // Decide billing provider during onboarding (server-side). If missing/invalid, set a safe default.
      // TODO: Make billing provider an explicit onboarding step (do not rely on heuristics).
      const existingProvider = normalizeBillingProvider(store.billingProvider);
      if (!existingProvider) {
        const billingProvider = decideBillingProvider(store);
        await admin.firestore().collection("stores").doc(String(storeDoc.id)).set(
          { billingProvider },
          { merge: true }
        );
        req.store = { ...store, billingProvider };
      } else {
        req.store = store;
      }
    }

    const existingProvider = normalizeBillingProvider(req.store?.billingProvider);
    if (!existingProvider) {
      const billingProvider = decideBillingProvider(req.store || {});
      await admin.firestore().collection("stores").doc(String(req.storeId)).set(
        { billingProvider },
        { merge: true }
      );
      req.store = { ...(req.store || {}), billingProvider };
    }

    req.store = await reconcileTrialExpiryOnAccess({
      storeId: String(req.storeId),
      store: req.store,
      now: new Date()
    });

    return next();
  } catch (error) {
    console.error("API key gate error:", error);
    return res.status(500).json({ error: "Auth check failed" });
  }
}

async function subscriptionGate(req, res, next) {
  try {
    const storeId = req.storeId;
    if (!storeId) {
      return res.status(400).json({ error: "Missing storeId" });
    }

    let store = req.store;
    if (!store) {
      const storeSnap = await admin.firestore().collection("stores").doc(String(storeId)).get();
      if (!storeSnap.exists) {
        return res.status(404).json({ error: "Store not found" });
      }
      store = storeSnap.data();
    }

    let plan = String(store.plan || "inactive");
    const trialStart = store.trialStartAt?.toDate ? store.trialStartAt.toDate() : null;
    const now = new Date();

    // Initialize trial only for legacy stores with no plan set.
    if (!store.plan && !trialStart) {
      await admin.firestore().collection("stores").doc(String(storeId)).set({
        plan: "trial",
        trialStartAt: admin.firestore.Timestamp.fromDate(now)
      }, { merge: true });
      store = { ...store, plan: "trial", trialStartAt: admin.firestore.Timestamp.fromDate(now) };
    }

    plan = String(store.plan || "inactive");
    if (plan === "active") {
      req.storeId = String(storeId);
      req.store = store;
      return next();
    }

    if (plan === "trial") {
      const { trialEndDate } = getTrialDates(store, now);
      const trialExpired = !trialStart || !trialEndDate || now > trialEndDate;

      if (trialExpired) {
        await admin.firestore().collection("stores").doc(String(storeId)).set({
          plan: "inactive",
          trialExpiredAt: admin.firestore.Timestamp.fromDate(now)
        }, { merge: true });
        logTrialExpiryOnce(req, { reason: "trial_window_elapsed_or_invalid" });
        return sendTrialExpired(res);
      }

      const msPerDay = 24 * 60 * 60 * 1000;
      const trialDaysLeft = Math.max(0, Math.ceil((trialEndDate.getTime() - now.getTime()) / msPerDay));
      req.trialDaysLeft = trialDaysLeft;
      res.locals.trialDaysLeft = trialDaysLeft;
      res.set("x-trial-days-left", String(trialDaysLeft));
      req.storeId = String(storeId);
      req.store = store;
      return next();
    }

    if (plan === "inactive" && store.trialExpiredAt) {
      logTrialExpiryOnce(req, { reason: "already_marked_trial_expired" });
      return sendTrialExpired(res);
    }

    return sendUpgradeRequired(res, {
      status: 402,
      error: "subscription_inactive",
      message: UPGRADE_PROMPT
    });

  } catch (error) {
    console.error("Subscription gate error:", error);
    return res.status(500).json({ error: "Subscription check failed" });
  }
}

app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/stores", apiKeyGate, apiRateLimit, async (req, res) => {
  try {
    const snapshot = await db.collection("stores").doc(req.storeId).get();
    if (!snapshot.exists) {
      return res.status(404).json({ error: "Store not found" });
    }
    return res.json({ id: snapshot.id, ...snapshot.data() });
  } catch (error) {
    console.error("Stores endpoint error:", error);
    return res.status(500).json({ error: "Failed to load store" });
  }
});

app.get("/pricing", apiKeyGate, apiRateLimit, (req, res) => {
  try {
    // Pricing is derived from backend config + store billing provider (frontend never decides).
    const pricing = getPricingForStore(req.store);
    return res.json(pricing);
  } catch (error) {
    console.error("Pricing error:", error);
    return res.status(500).json({ error: "Failed to load pricing" });
  }
});

// Use raw body for Shopify HMAC verification (must run before JSON parsing).
app.use("/webhook/shopify", express.raw({ type: "application/json", limit: "1mb" }), webhookRateLimit, shopifyWebhook);
// Use raw body for Lemon Squeezy signature verification (must run before JSON parsing).
app.use("/webhook/lemonsqueezy", express.raw({ type: "application/json", limit: "1mb" }), webhookRateLimit, lemonSqueezyWebhook);
// Use raw body for Razorpay signature verification (must run before JSON parsing).
app.use("/webhook/razorpay", express.raw({ type: "application/json", limit: "1mb" }), webhookRateLimit, razorpayWebhook);

// JSON parsing for all other routes.
app.use(express.json({ limit: "1mb" }));

app.post("/auth/complete-signup", async (req, res) => {
  try {
    const authToken = getApiKey(req);
    if (!authToken || !isLikelyJwt(authToken)) {
      console.warn("Complete signup denied: missing_or_invalid_auth_header", {
        path: req.path || "",
        ip: req.ip || ""
      });
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.body?.userId !== undefined || req.body?.uid !== undefined || req.body?.storeId !== undefined) {
      console.warn("Complete signup denied: client_sent_protected_identifiers", {
        path: req.path || "",
        ip: req.ip || ""
      });
      return res.status(400).json({ error: "Invalid request payload" });
    }

    const firebaseUser = await getFirebaseUserFromRequest(req);
    if (!firebaseUser?.uid) {
      console.warn("Complete signup denied: token_verification_failed", {
        path: req.path || "",
        ip: req.ip || ""
      });
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = String(firebaseUser.uid);
    const email = String(firebaseUser.email || "").trim().toLowerCase();
    const userRef = db.collection("users").doc(userId);

    let created = false;
    await db.runTransaction(async tx => {
      const now = new Date();
      const userSnap = await tx.get(userRef);
      const userData = userSnap.data() || {};
      created = !userSnap.exists;

      const userPayload = {
        lastLoginAt: now
      };
      if (!userData.createdAt) userPayload.createdAt = now;
      if (email || !userData.email) userPayload.email = email;
      if (typeof userData.onboardingCompleted !== "boolean") userPayload.onboardingCompleted = false;

      tx.set(userRef, { ...userPayload }, { merge: true });
    });

    const mapping = await ensureUserStoreMapping({
      uid: userId,
      email,
      country: resolveCountryFromRequest(req)
    });

    return res.json({
      ok: true,
      userId,
      email,
      storeId: mapping.storeId,
      created,
      createdStore: Boolean(mapping.created)
    });
  } catch (error) {
    console.error("Complete signup error", {
      path: req.path || "",
      code: String(error?.code || ""),
      message: String(error?.message || "unknown_error")
    });
    return res.status(500).json({ error: "Failed to persist user" });
  }
});

app.post("/auth/bootstrap", async (req, res) => {
  try {
    const firebaseUser = await getFirebaseUserFromRequest(req);
    if (!firebaseUser?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const mapping = await ensureUserStoreMapping({
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      country: resolveCountryFromRequest(req)
    });

    const storeSnap = await db.collection("stores").doc(String(mapping.storeId)).get();
    if (!storeSnap.exists) {
      return res.status(404).json({ error: "Store not found" });
    }
    const store = storeSnap.data() || {};
    const onboardingCompleted = store.onboardingCompleted === false ? false : true;

    return res.json({
      userId: firebaseUser.uid,
      storeId: mapping.storeId,
      onboardingCompleted,
      created: Boolean(mapping.created)
    });
  } catch (error) {
    console.error("Auth bootstrap error:", error);
    return res.status(500).json({ error: "Failed to initialize user store mapping" });
  }
});

app.post("/onboarding/complete", apiKeyGate, apiRateLimit, async (req, res) => {
  try {
    const storeId = String(req.storeId || "");
    if (!storeId) {
      return res.status(400).json({ error: "Missing storeId" });
    }

    const now = admin.firestore.Timestamp.now();
    await db.collection("stores").doc(storeId).set({
      onboardingCompleted: true,
      onboardingCompletedAt: now
    }, { merge: true });

    return res.json({ ok: true, onboardingCompleted: true });
  } catch (error) {
    console.error("Onboarding complete error:", error);
    return res.status(500).json({ error: "Failed to complete onboarding" });
  }
});

app.post("/onboarding/reset", async (req, res) => {
  try {
    const firebaseUser = await getFirebaseUserFromRequest(req);
    if (!firebaseUser?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const onboardingConfig = getOnboardingConfig();
    const debugToken = String(req.get("x-debug-reset-token") || "").trim();
    const expectedToken = String(onboardingConfig.debugResetToken || "").trim();
    if (!onboardingConfig.debugResetEnabled || !expectedToken || debugToken !== expectedToken) {
      return res.status(403).json({ error: "Reset not allowed" });
    }

    const storeId = await resolveStoreIdForUser(firebaseUser.uid, { autoCreate: false });
    if (!storeId) {
      return res.status(404).json({ error: "Store mapping not found" });
    }

    await db.collection("stores").doc(String(storeId)).set({
      onboardingCompleted: false,
      onboardingCompletedAt: admin.firestore.FieldValue.delete()
    }, { merge: true });

    console.warn("Onboarding reset via debug endpoint", {
      userId: firebaseUser.uid,
      storeId
    });

    return res.json({ ok: true, onboardingCompleted: false });
  } catch (error) {
    console.error("Onboarding reset error:", error);
    return res.status(500).json({ error: "Failed to reset onboarding state" });
  }
});

const SHOPIFY_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SHOPIFY_TOKEN_ENCRYPTION_ALGORITHM = "aes-256-gcm";
const SHOPIFY_REQUIRED_WEBHOOK_TOPICS = ["orders/create", "orders/updated", "orders/cancelled"];
const SHOPIFY_SHOP_DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.myshopify\.com$/;
const SHOPIFY_STORE_NAME_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/;

function normalizeShopifyDomain(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    return String(parsed.hostname || "").trim().toLowerCase();
  } catch (error) {
    return "";
  }
}

function parseShopifyDomain(input) {
  const normalized = normalizeShopifyDomain(input);
  if (!normalized) return "";
  if (!SHOPIFY_SHOP_DOMAIN_REGEX.test(normalized)) return "";
  return normalized;
}

function getShopifyCallbackUri() {
  const shopifyConfig = getShopifyConfig();
  const configuredRedirectUri = String(shopifyConfig.redirectUri || "").trim();
  if (configuredRedirectUri) return configuredRedirectUri;

  const appUrl = String(shopifyConfig.appUrl || "").replace(/\/+$/, "");
  if (!appUrl) return "";
  return `${appUrl}/shopify/callback`;
}

function getShopifyDashboardRedirectUrl() {
  const appUrl = String(getShopifyConfig().appUrl || "").replace(/\/+$/, "");
  if (appUrl) {
    return `${appUrl}/`;
  }
  return "https://metricmango.store/";
}

function getShopifyApiVersion() {
  const configuredVersion = String(getShopifyConfig().apiVersion || "").trim();
  return configuredVersion || "2024-10";
}

function getShopifyWebhookBaseUrl() {
  const callbackUri = getShopifyCallbackUri();
  if (callbackUri) {
    try {
      const parsed = new URL(callbackUri);
      const normalizedPath = String(parsed.pathname || "").replace(/\/+$/, "");
      const callbackSuffix = "/shopify/callback";
      const basePath = normalizedPath.endsWith(callbackSuffix)
        ? normalizedPath.slice(0, -callbackSuffix.length)
        : normalizedPath;
      return `${parsed.origin}${basePath}`;
    } catch (error) {
      // Fall back to app URL if callback URI is not parseable.
    }
  }

  const appUrl = String(getShopifyConfig().appUrl || "").replace(/\/+$/, "");
  if (!appUrl) return "";
  return `${appUrl}/api`;
}

function buildShopifyWebhookAddress(storeId) {
  const baseUrl = String(getShopifyWebhookBaseUrl() || "").replace(/\/+$/, "");
  if (!baseUrl) return "";
  return `${baseUrl}/webhook/shopify/order-created?storeId=${encodeURIComponent(String(storeId || ""))}`;
}

function buildShopifyInstallUrl({ shopDomain, state }) {
  const shopifyConfig = getShopifyConfig();
  const apiKey = String(shopifyConfig.appApiKey || "").trim();
  const scopes = String(shopifyConfig.scopes || "").trim();
  const redirectUri = getShopifyCallbackUri();

  if (!apiKey || !redirectUri || !scopes) {
    return "";
  }

  const params = new URLSearchParams({
    client_id: apiKey,
    scope: scopes,
    redirect_uri: redirectUri,
    state
  });

  return `https://${shopDomain}/admin/oauth/authorize?${params.toString()}`;
}

function shopifyOauthHmacPayload(query = {}) {
  const pairs = [];
  Object.keys(query)
    .filter(key => key !== "hmac" && key !== "signature")
    .sort()
    .forEach(key => {
      const value = Array.isArray(query[key]) ? query[key].join(",") : String(query[key] || "");
      pairs.push(`${key}=${value}`);
    });
  return pairs.join("&");
}

function timingSafeCompareStrings(left, right) {
  const leftValue = String(left || "");
  const rightValue = String(right || "");
  const leftBuffer = Buffer.from(leftValue, "utf8");
  const rightBuffer = Buffer.from(rightValue, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyShopifyOauthHmac(query = {}) {
  const apiSecret = String(getShopifyConfig().appApiSecret || "").trim();
  const providedHmac = String(query.hmac || "").trim().toLowerCase();
  if (!apiSecret || !providedHmac) return false;

  const payload = shopifyOauthHmacPayload(query);
  const expectedHmac = crypto.createHmac("sha256", apiSecret).update(payload).digest("hex");
  return timingSafeCompareStrings(providedHmac, expectedHmac);
}

function getShopifyTokenEncryptionKey() {
  const rawKey = String(getShopifyConfig().tokenEncryptionKey || "").trim();
  if (!rawKey) return null;

  const looksLikeBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(rawKey) && rawKey.length % 4 === 0;
  if (looksLikeBase64) {
    const decoded = Buffer.from(rawKey, "base64");
    if (decoded.length === 32) {
      return decoded;
    }
  }

  // Keep local setup simple: any non-empty string can be used and is normalized to 32 bytes.
  return crypto.createHash("sha256").update(rawKey).digest();
}

function encryptShopifyAccessToken(accessToken) {
  const key = getShopifyTokenEncryptionKey();
  if (!key) {
    throw new Error("Missing SHOPIFY_TOKEN_ENCRYPTION_KEY");
  }
  const plainToken = String(accessToken || "").trim();
  if (!plainToken) {
    throw new Error("Missing Shopify access token");
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(SHOPIFY_TOKEN_ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainToken, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64")
  ].join(":");
}

async function saveShopifyOauthState({ state, userId, storeId, shopDomain }) {
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + SHOPIFY_OAUTH_STATE_TTL_MS);
  await db.collection("shopify_oauth_states").doc(String(state)).set({
    state: String(state),
    userId: String(userId),
    storeId: String(storeId),
    shopDomain: String(shopDomain),
    createdAt: now,
    expiresAt,
    consumedAt: null
  });
}

async function consumeShopifyOauthState(state) {
  const stateId = String(state || "").trim();
  if (!stateId) return null;
  const stateRef = db.collection("shopify_oauth_states").doc(stateId);

  return db.runTransaction(async tx => {
    const now = admin.firestore.Timestamp.now();
    const snap = await tx.get(stateRef);
    if (!snap.exists) {
      return null;
    }
    const data = snap.data() || {};
    const isConsumed = Boolean(data.consumedAt);
    const expiresAtMs = data.expiresAt?.toMillis ? data.expiresAt.toMillis() : 0;
    const isExpired = !expiresAtMs || Date.now() > expiresAtMs;
    if (isConsumed || isExpired) {
      if (isExpired && !data.expiredAt) {
        tx.set(stateRef, { expiredAt: now }, { merge: true });
      }
      return null;
    }

    tx.set(stateRef, { consumedAt: now }, { merge: true });
    return data;
  });
}

function isShopifyConnectedStore(store = {}) {
  const hasShopDomain = Boolean(String(store.shopDomain || "").trim());
  const hasEncryptedToken = Boolean(String(store.encryptedAccessToken || "").trim());
  return Boolean(store.shopifyConnected) || (hasShopDomain && hasEncryptedToken);
}

async function exchangeShopifyCodeForAccessToken({ shopDomain, code }) {
  const shopifyConfig = getShopifyConfig();
  const apiKey = String(shopifyConfig.appApiKey || "").trim();
  const apiSecret = String(shopifyConfig.appApiSecret || "").trim();
  const authCode = String(code || "").trim();

  if (!apiKey || !apiSecret) {
    throw new Error("Missing SHOPIFY_APP_API_KEY or SHOPIFY_APP_API_SECRET");
  }
  if (!authCode) {
    throw new Error("Missing Shopify authorization code");
  }

  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      code: authCode
    })
  });

  const bodyText = await response.text();
  let payload = {};
  try {
    payload = bodyText ? JSON.parse(bodyText) : {};
  } catch (error) {
    payload = {};
  }

  if (!response.ok) {
    const reason = String(payload.error_description || payload.error || bodyText || response.status);
    throw new Error(`Shopify token exchange failed: ${reason}`);
  }

  const accessToken = String(payload.access_token || "").trim();
  if (!accessToken) {
    throw new Error("Shopify token exchange response missing access_token");
  }
  return accessToken;
}

async function registerSingleShopifyWebhook({ shopDomain, accessToken, topic, address }) {
  const apiVersion = getShopifyApiVersion();
  const endpoint = `https://${shopDomain}/admin/api/${apiVersion}/webhooks.json`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-shopify-access-token": String(accessToken)
    },
    body: JSON.stringify({
      webhook: {
        topic,
        address,
        format: "json"
      }
    })
  });

  const bodyText = await response.text();
  let payload = {};
  try {
    payload = bodyText ? JSON.parse(bodyText) : {};
  } catch (error) {
    payload = {};
  }

  if (response.status === 422) {
    return {
      topic,
      status: "exists",
      webhookId: String(payload?.webhook?.id || "")
    };
  }
  if (!response.ok) {
    const reason = String(payload?.errors || payload?.error || bodyText || response.status);
    throw new Error(`Failed to register webhook ${topic}: ${reason}`);
  }

  return {
    topic,
    status: "created",
    webhookId: String(payload?.webhook?.id || "")
  };
}

async function registerRequiredShopifyWebhooks({ shopDomain, accessToken, storeId }) {
  const address = buildShopifyWebhookAddress(storeId);
  if (!address) {
    throw new Error("Missing webhook callback URL configuration");
  }

  const results = [];
  for (const topic of SHOPIFY_REQUIRED_WEBHOOK_TOPICS) {
    const result = await registerSingleShopifyWebhook({
      shopDomain,
      accessToken,
      topic,
      address
    });
    results.push(result);
  }

  return { address, results };
}

async function handleShopifyConnect(req, res) {
  try {
    const firebaseUser = req.firebaseUser;
    const userId = String(firebaseUser?.uid || "");
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const mapping = await ensureUserStoreMapping({
      uid: userId,
      email: firebaseUser?.email || "",
      country: resolveCountryFromRequest(req)
    });
    const storeId = String(mapping?.storeId || "");
    if (!storeId) {
      return res.status(400).json({ error: "Missing store context" });
    }

    const storeRef = db.collection("stores").doc(storeId);
    const storeSnap = await storeRef.get();
    if (!storeSnap.exists) {
      return res.status(404).json({ error: "Store not found" });
    }
    const storeData = storeSnap.data() || {};
    if (String(storeData.ownerUserId || "") !== userId) {
      return res.status(403).json({ error: "store_access_denied" });
    }
    if (isShopifyConnectedStore(storeData)) {
      return res.status(409).json({ error: "Shopify store is already connected for this account" });
    }

    const ownedStores = await getOwnedStores(userId);
    const hasConnectedStore = ownedStores.some(doc => {
      if (String(doc.id) === storeId) return false;
      return isShopifyConnectedStore(doc.data() || {});
    });
    if (hasConnectedStore) {
      return res.status(409).json({ error: "Only one Shopify store can be connected per user" });
    }

    const shopifyConfig = getShopifyConfig();
    const appApiKey = String(shopifyConfig.appApiKey || "").trim();
    const appApiSecret = String(shopifyConfig.appApiSecret || "").trim();
    const redirectUri = String(getShopifyCallbackUri() || "").trim();
    const webhookAddress = buildShopifyWebhookAddress(storeId);
    if (!appApiKey || !appApiSecret || !redirectUri) {
      return res.status(500).json({ error: "Shopify OAuth is not configured on server" });
    }
    if (!getShopifyTokenEncryptionKey()) {
      return res.status(500).json({ error: "Missing Shopify token encryption configuration" });
    }
    if (!webhookAddress) {
      return res.status(500).json({ error: "Missing Shopify webhook callback configuration" });
    }

    const requestedShop = req.body?.shop ?? req.body?.shopUrl;
    const storeName = String(req.body?.storeName || req.body?.shopName || "").trim().toLowerCase();
    let shopDomain = "";
    if (storeName) {
      if (!SHOPIFY_STORE_NAME_REGEX.test(storeName)) {
        return res.status(400).json({ error: "Invalid Shopify store name. Use letters, numbers, and hyphens only." });
      }
      shopDomain = `${storeName}.myshopify.com`;
    } else {
      shopDomain = requestedShop;
    }

    shopDomain = parseShopifyDomain(shopDomain);
    if (!shopDomain) {
      return res.status(400).json({ error: "Invalid Shopify shop domain" });
    }

    const installUrlState = crypto.randomBytes(24).toString("hex");
    const installUrl = buildShopifyInstallUrl({
      shopDomain,
      state: installUrlState
    });
    if (!installUrl) {
      return res.status(500).json({ error: "Shopify OAuth is not configured on server" });
    }

    await saveShopifyOauthState({
      state: installUrlState,
      userId,
      storeId,
      shopDomain
    });

    const now = admin.firestore.Timestamp.now();
    await storeRef.set({
      shopDomain,
      shopifyConnected: false,
      shopifyInstallStatus: "pending",
      shopifyInstallStartedAt: now,
      shopifyWebhookStatus: "pending",
      shopifyConnectionError: admin.firestore.FieldValue.delete(),
      shopifyConnectionErrorAt: admin.firestore.FieldValue.delete()
    }, { merge: true });

    return res.json({
      ok: true,
      redirectUrl: installUrl,
      installUrl,
      message: "Shopify OAuth started"
    });
  } catch (error) {
    console.error("Shopify connect error:", {
      message: String(error?.message || "unknown_error")
    });
    return res.status(500).json({ error: "Failed to start Shopify OAuth" });
  }
}

app.post("/shopify/connect", requireFirebaseUser, apiRateLimit, handleShopifyConnect);
app.post("/onboarding/shopify/connect", requireFirebaseUser, apiRateLimit, handleShopifyConnect);

app.post("/shopify/disconnect", requireFirebaseUser, apiRateLimit, async (req, res) => {
  try {
    const firebaseUser = req.firebaseUser;
    const userId = String(firebaseUser?.uid || "");
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const mapping = await ensureUserStoreMapping({
      uid: userId,
      email: firebaseUser?.email || ""
    });
    const storeId = String(mapping?.storeId || "");
    if (!storeId) {
      return res.status(400).json({ error: "Missing store context" });
    }

    const storeRef = db.collection("stores").doc(storeId);
    const storeSnap = await storeRef.get();
    if (!storeSnap.exists) {
      return res.status(404).json({ error: "Store not found" });
    }
    const storeData = storeSnap.data() || {};
    if (String(storeData.ownerUserId || "") !== userId) {
      return res.status(403).json({ error: "store_access_denied" });
    }

    if (!isShopifyConnectedStore(storeData)) {
      return res.json({ ok: true, disconnected: false, message: "No Shopify store connected." });
    }

    const now = admin.firestore.Timestamp.now();
    await storeRef.set({
      shopifyConnected: false,
      shopifyInstallStatus: "disconnected",
      shopifyWebhookStatus: "inactive",
      shopifyWebhookTopics: [],
      shopifyWebhookAddress: admin.firestore.FieldValue.delete(),
      shopifyWebhookRegistration: admin.firestore.FieldValue.delete(),
      encryptedAccessToken: admin.firestore.FieldValue.delete(),
      shopifyConnectionError: admin.firestore.FieldValue.delete(),
      shopifyConnectionErrorAt: admin.firestore.FieldValue.delete(),
      shopifyDisconnectedAt: now
    }, { merge: true });

    return res.json({ ok: true, disconnected: true, message: "Shopify store disconnected." });
  } catch (error) {
    console.error("Shopify disconnect error:", error);
    return res.status(500).json({ error: "Failed to disconnect Shopify store" });
  }
});

app.get("/shopify/callback", webhookRateLimit, async (req, res) => {
  let stateRecord = null;
  let storeId = "";
  try {
    const shopDomain = parseShopifyDomain(req.query?.shop);
    const code = String(req.query?.code || "").trim();
    const state = String(req.query?.state || "").trim();
    const hmac = String(req.query?.hmac || "").trim();

    if (!shopDomain || !code || !state || !hmac) {
      console.warn("Shopify callback rejected: missing parameters", {
        shopDomain,
        hasCode: Boolean(code),
        hasState: Boolean(state),
        hasHmac: Boolean(hmac)
      });
      return res.status(400).send("Invalid Shopify callback parameters");
    }

    if (!verifyShopifyOauthHmac(req.query)) {
      console.warn("Shopify callback rejected: invalid HMAC", {
        shopDomain
      });
      return res.status(401).send("Invalid Shopify callback signature");
    }

    stateRecord = await consumeShopifyOauthState(state);
    if (!stateRecord) {
      console.warn("Shopify callback rejected: invalid or expired state", {
        shopDomain
      });
      return res.status(400).send("Invalid or expired Shopify OAuth state");
    }

    storeId = String(stateRecord.storeId || "");
    const userId = String(stateRecord.userId || "");
    const expectedShop = String(stateRecord.shopDomain || "").trim().toLowerCase();
    if (!storeId || !userId || !expectedShop || expectedShop !== shopDomain) {
      console.warn("Shopify callback rejected: state mismatch", {
        storeId,
        userId,
        expectedShop,
        shopDomain
      });
      return res.status(400).send("Shopify OAuth state mismatch");
    }

    // Ensure the authenticated user from the saved session still exists.
    try {
      await admin.auth().getUser(userId);
    } catch (authError) {
      console.warn("Shopify callback rejected: user not found", {
        userId,
        shopDomain,
        reason: authError?.message || "user_not_found"
      });
      return res.status(401).send("Unauthorized");
    }

    const storeRef = db.collection("stores").doc(storeId);
    const storeSnap = await storeRef.get();
    if (!storeSnap.exists) {
      return res.status(404).send("Store not found");
    }
    const storeData = storeSnap.data() || {};
    if (String(storeData.ownerUserId || "") !== userId) {
      console.warn("Shopify callback rejected: owner mismatch", {
        storeId,
        expectedOwner: userId,
        actualOwner: String(storeData.ownerUserId || "")
      });
      return res.status(403).send("Store access denied");
    }

    // Enforce one connected Shopify store per user (backend-only check).
    const ownedStores = await getOwnedStores(userId);
    const otherConnectedStore = ownedStores.find(doc => String(doc.id) !== storeId && isShopifyConnectedStore(doc.data() || {}));
    if (otherConnectedStore || isShopifyConnectedStore(storeData)) {
      const now = admin.firestore.Timestamp.now();
      await storeRef.set({
        shopifyInstallStatus: "error",
        shopifyConnectionError: "Store already connected.",
        shopifyConnectionErrorAt: now
      }, { merge: true }).catch(() => {});
      return res.status(409).send("Store already connected.");
    }

    const accessToken = await exchangeShopifyCodeForAccessToken({
      shopDomain,
      code
    });
    const encryptedAccessToken = encryptShopifyAccessToken(accessToken);
    const webhookRegistration = await registerRequiredShopifyWebhooks({
      shopDomain,
      accessToken,
      storeId
    });

    const now = admin.firestore.Timestamp.now();
    await storeRef.set({
      ownerUserId: userId,
      shopDomain,
      encryptedAccessToken,
      shopifyConnected: true,
      shopifyInstallStatus: "connected",
      shopifyConnectedAt: now,
      shopifyWebhookStatus: "active",
      shopifyWebhookTopics: SHOPIFY_REQUIRED_WEBHOOK_TOPICS,
      shopifyWebhookAddress: webhookRegistration.address,
      shopifyWebhookRegistration: webhookRegistration.results,
      onboardingCompleted: true,
      onboardingCompletedAt: now,
      shopifyConnectionError: admin.firestore.FieldValue.delete(),
      shopifyConnectionErrorAt: admin.firestore.FieldValue.delete()
    }, { merge: true });

    await db.collection("shopify_oauth_states").doc(state).set({
      status: "completed",
      completedAt: admin.firestore.Timestamp.now()
    }, { merge: true });

    console.info("Shopify OAuth connected", {
      storeId,
      userId,
      shopDomain
    });

    return res.redirect(getShopifyDashboardRedirectUrl());
  } catch (error) {
    console.error("Shopify callback error:", {
      storeId: storeId || String(stateRecord?.storeId || ""),
      shopDomain: String(req.query?.shop || ""),
      message: String(error?.message || "unknown_error")
    });

    if (storeId) {
      await db.collection("stores").doc(storeId).set({
        shopifyInstallStatus: "error",
        shopifyConnectionError: String(error?.message || "Shopify OAuth callback failed").slice(0, 500),
        shopifyConnectionErrorAt: admin.firestore.Timestamp.now()
      }, { merge: true }).catch(() => {});
    }

    return res.status(500).send("Failed to complete Shopify connection");
  }
});

app.get("/onboarding/status", apiKeyGate, apiRateLimit, async (req, res) => {
  try {
    const storeId = String(req.storeId || "");
    if (!storeId) {
      return res.status(400).json({ error: "Missing store context" });
    }

    const storeSnap = await db.collection("stores").doc(storeId).get();
    if (!storeSnap.exists) {
      return res.status(404).json({ error: "Store not found" });
    }

    const store = storeSnap.data() || {};
    const plan = String(store.plan || "inactive");
    const trialDaysLeft = getTrialDaysLeftFromStore(store, new Date());
    const webhookActive = String(store.shopifyWebhookStatus || "") === "active";
    const storeConnected = isShopifyConnectedStore(store) || Boolean(String(store.shopDomain || "").trim());
    const ordersSyncing = webhookActive || Boolean(store.lastOrderSyncedAt);
    const trialStarted = Boolean(store.trialStartAt) || plan === "trial";

    return res.json({
      storeConnected,
      ordersSyncing,
      trialDaysLeft,
      checklist: {
        webhookActive,
        trialStarted
      }
    });
  } catch (error) {
    console.error("Onboarding status error:", error);
    return res.status(500).json({ error: "Failed to load onboarding status" });
  }
});

app.use("/dashboard", apiKeyGate, apiRateLimit, subscriptionGate, dashboard);
app.use("/forecast", apiKeyGate, apiRateLimit, subscriptionGate, (req, res, next) => {
  if (!requireFeature(req.store, "forecasting")) {
    return res.status(403).json({ error: "Feature disabled: forecasting" });
  }
  return next();
}, forecast);
app.get("/restock-suggestions", apiKeyGate, apiRateLimit, subscriptionGate, async (req, res) => {
  try {
    const { storeId } = req;
    const parsedLeadTime = Number(req.query.leadTimeDays);
    const hasLeadTimeParam = req.query.leadTimeDays !== undefined;
    // Guard against NaN/negative/zero values at the route level.
    if (hasLeadTimeParam && (!Number.isFinite(parsedLeadTime) || parsedLeadTime <= 0)) {
      return res.status(400).json({ error: "Invalid leadTimeDays" });
    }
    const leadTimeDays = hasLeadTimeParam ? parsedLeadTime : 7;
    const suggestions = await computeRestockSuggestions(storeId, leadTimeDays);
    // Response example:
    // {
    //   leadTimeDays: 7,
    //   suggestions: [
    //     { productId: "abc", currentStock: 12, avgDailySales: 1.4, expectedDemand: 9.8, suggestion: "SAFE" }
    //   ]
    // }
    return res.json({ leadTimeDays, suggestions });
  } catch (error) {
    console.error("Restock error:", error);
    return res.status(500).json({ error: "Failed to compute restock suggestions" });
  }
});

app.get("/alerts/low-stock", apiKeyGate, apiRateLimit, subscriptionGate, async (req, res) => {
  try {
    if (!requireFeature(req.store, "emailAlerts")) {
      return res.status(403).json({ error: "Feature disabled: emailAlerts" });
    }
    const { storeId } = req;
    const parsedThreshold = Number(req.query.thresholdDays);
    const hasThreshold = req.query.thresholdDays !== undefined;
    if (hasThreshold && (!Number.isFinite(parsedThreshold) || parsedThreshold <= 0)) {
      return res.status(400).json({ error: "Invalid thresholdDays" });
    }
    const thresholdDays = hasThreshold ? parsedThreshold : 5;
    const result = await sendLowStockAlertsForStore(storeId, thresholdDays);
    return res.json(result);
  } catch (error) {
    console.error("Low stock alert error:", error);
    return res.status(500).json({ error: "Failed to send low stock alerts" });
  }
});

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function providerMessage(provider) {
  return provider === "razorpay" ? "Razorpay" : "Lemon Squeezy";
}

function buildProviderGuardError(guardResult) {
  const provider = String(guardResult?.provider || "");
  const label = providerMessage(provider);
  const reason = String(guardResult?.reason || "guard_failed");
  if (reason === "provider_disabled") {
    return createHttpError(403, `${label} is disabled`);
  }
  if (reason === "store_provider_mismatch") {
    return createHttpError(403, `Store billing provider does not match ${label}`);
  }
  if (reason === "missing_store_billing_provider") {
    return createHttpError(400, "Missing store billing provider");
  }
  if (reason === "missing_provider_secrets") {
    return createHttpError(500, `Missing required ${label} secrets`);
  }
  return createHttpError(Number(guardResult?.statusCode) || 400, "Billing provider guard failed");
}

async function createUpgradeCheckoutForStore({ storeId, store, redirectUrl = "" }) {
  const provider = normalizeBillingProvider(store?.billingProvider);
  if (!provider) {
    throw createHttpError(400, "Missing or invalid billing provider");
  }

  const guardResult = evaluateProviderGuard({
    provider,
    store,
    action: "checkout",
    requireStoreProviderMatch: true
  });
  if (!guardResult.ok) {
    throw buildProviderGuardError(guardResult);
  }

  if (provider === "razorpay") {
    const planId = String(getBillingConfig().razorpay.planId || "").trim();
    if (!planId) {
      throw createHttpError(400, "Missing Razorpay planId in config");
    }

    // TODO: Make total_count configurable via store settings or billing config.
    const subscription = await createRazorpaySubscription({
      planId,
      totalCount: 12,
      customerNotify: 1,
      notes: { storeId }
    });

    await admin.firestore().collection("stores").doc(String(storeId)).set({
      razorpaySubscriptionId: subscription.id || "",
      razorpayStatus: subscription.status || "created"
    }, { merge: true });

    const checkoutUrl = String(subscription.short_url || "").trim();
    if (!checkoutUrl) {
      throw createHttpError(500, "Missing checkout URL from Razorpay");
    }

    return { provider, checkoutUrl };
  }

  if (provider === "lemonsqueezy") {
    const variantId = String(store?.lemonSqueezyVariantId || "").trim();
    if (!variantId) {
      throw createHttpError(400, "Missing lemonSqueezyVariantId for store");
    }

    const checkout = await createLemonSqueezyCheckout({
      storeId,
      variantId,
      redirectUrl
    });
    const checkoutUrl = String(
      checkout?.data?.attributes?.url
      || checkout?.data?.attributes?.checkout_url
      || ""
    ).trim();
    if (!checkoutUrl) {
      throw createHttpError(500, "Missing checkout URL from Lemon Squeezy");
    }

    return { provider, checkoutUrl };
  }

  throw createHttpError(400, "Unsupported billing provider");
}

app.get("/billing/providers", apiKeyGate, apiRateLimit, (req, res) => {
  try {
    const storeProvider = normalizeBillingProvider(req.store?.billingProvider);
    const enabledProviders = getEnabledProviders();
    const providers = [
      { provider: "razorpay", enabled: Boolean(enabledProviders.razorpay) },
      { provider: "lemonsqueezy", enabled: Boolean(enabledProviders.lemonsqueezy) }
    ];
    return res.json({
      storeProvider,
      providers,
      availableProviders: providers.filter(item => item.enabled).map(item => item.provider)
    });
  } catch (error) {
    console.error("Billing providers endpoint error:", error);
    return res.status(500).json({ error: "Failed to load billing providers" });
  }
});

app.post("/billing/upgrade", apiKeyGate, apiRateLimit, async (req, res) => {
  try {
    const storeId = String(req.storeId || "");
    const redirectUrl = req.query.redirectUrl ? String(req.query.redirectUrl) : "";
    const wantsJson = String(req.query.json || "").toLowerCase() === "1";

    console.info("Billing upgrade request received", {
      storeId,
      provider: normalizeBillingProvider(req.store?.billingProvider) || "unknown",
      mode: wantsJson ? "json" : "redirect"
    });

    const { provider, checkoutUrl } = await createUpgradeCheckoutForStore({
      storeId,
      store: req.store,
      redirectUrl
    });

    console.info("Billing upgrade checkout ready", {
      storeId,
      provider,
      mode: wantsJson ? "json" : "redirect"
    });

    if (wantsJson) {
      return res.json({ provider, checkoutUrl });
    }
    return res.redirect(checkoutUrl);
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    console.error("Billing upgrade error:", {
      storeId: String(req.storeId || ""),
      provider: normalizeBillingProvider(req.store?.billingProvider) || "unknown",
      message: error?.message || "Unknown error",
      statusCode
    });
    return res.status(statusCode).json({ error: error?.message || "Failed to create upgrade checkout" });
  }
});

app.post("/billing/razorpay/subscribe", apiKeyGate, apiRateLimit, async (req, res) => {
  try {
    const guardResult = evaluateProviderGuard({
      provider: "razorpay",
      store: req.store,
      action: "checkout",
      requireStoreProviderMatch: true
    });
    if (!guardResult.ok) {
      const provider = "razorpay";
      const error = buildProviderGuardError({ ...guardResult, provider });
      console.warn("Billing guard blocked Razorpay subscribe", {
        storeId: req.storeId,
        provider,
        reason: guardResult.reason
      });
      return res.status(Number(error.statusCode) || 400).json({ error: error.message });
    }

    // Use backend config for Razorpay plan mapping (do not expose to frontend).
    const planId = String(getBillingConfig().razorpay.planId || "").trim();
    if (!planId) {
      return res.status(400).json({ error: "Missing Razorpay planId in config" });
    }

    // TODO: Make total_count configurable via store settings or billing config.
    const subscription = await createRazorpaySubscription({
      planId,
      totalCount: 12,
      customerNotify: 1,
      notes: {
        storeId: req.storeId
      }
    });

    await admin.firestore().collection("stores").doc(String(req.storeId)).set({
      razorpaySubscriptionId: subscription.id || "",
      razorpayStatus: subscription.status || "created"
    }, { merge: true });

    return res.json({
      subscriptionId: subscription.id,
      shortUrl: subscription.short_url || "",
      status: subscription.status || "created"
    });
  } catch (error) {
    console.error("Razorpay subscribe error:", error);
    return res.status(500).json({ error: "Failed to create Razorpay subscription" });
  }
});

app.get("/billing/lemonsqueezy/checkout", apiKeyGate, apiRateLimit, async (req, res) => {
  try {
    const guardResult = evaluateProviderGuard({
      provider: "lemonsqueezy",
      store: req.store,
      action: "checkout",
      requireStoreProviderMatch: true
    });
    if (!guardResult.ok) {
      const provider = "lemonsqueezy";
      const error = buildProviderGuardError({ ...guardResult, provider });
      console.warn("Billing guard blocked Lemon Squeezy checkout", {
        storeId: req.storeId,
        provider,
        reason: guardResult.reason
      });
      return res.status(Number(error.statusCode) || 400).json({ error: error.message });
    }

    const variantId = String(req.store?.lemonSqueezyVariantId || "").trim();
    if (!variantId) {
      return res.status(400).json({ error: "Missing lemonSqueezyVariantId for store" });
    }

    const redirectUrl = req.query.redirectUrl ? String(req.query.redirectUrl) : "";
    const checkout = await createLemonSqueezyCheckout({
      storeId: req.storeId,
      variantId,
      redirectUrl
    });

    const checkoutUrl = checkout?.data?.attributes?.url
      || checkout?.data?.attributes?.checkout_url
      || "";
    if (!checkoutUrl) {
      return res.status(500).json({ error: "Missing checkout URL from Lemon Squeezy" });
    }

    const wantsJson = String(req.query.json || "").toLowerCase() === "1";
    if (wantsJson) {
      return res.json({ checkoutUrl });
    }
    return res.redirect(checkoutUrl);
  } catch (error) {
    console.error("Lemon Squeezy checkout error:", error);
    return res.status(500).json({ error: "Failed to create Lemon Squeezy checkout" });
  }
});

app.get("/export/orders", apiKeyGate, apiRateLimit, subscriptionGate, async (req, res) => {
  try {
    if (!requireFeature(req.store, "csvExport")) {
      return res.status(403).json({ error: "Feature disabled: csvExport" });
    }
    const { storeId } = req;
    const parsedLimit = Number(req.query.limit);
    const hasLimit = req.query.limit !== undefined;
    if (hasLimit && (!Number.isFinite(parsedLimit) || parsedLimit <= 0 || parsedLimit > 1000)) {
      return res.status(400).json({ error: "Invalid limit (max 1000)" });
    }
    const limit = hasLimit ? parsedLimit : 500;

    // Security: always scope by storeId; keep exports small for MVP safety.
    const snapshot = await db.collection("orders")
      .where("storeId", "==", storeId)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const rows = snapshot.docs.map(doc => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : "";
      return {
        orderId: data.orderId || doc.id,
        productId: data.productId || "",
        quantity: Number(data.quantity || 0),
        price: Number(data.price || 0),
        createdAt
      };
    }).filter(row => row.productId);

    const columns = ["orderId", "productId", "quantity", "price", "createdAt"];
    const csv = toCsv(columns, rows);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"orders.csv\"");
    return res.status(200).send(csv);
  } catch (error) {
    console.error("Orders export error:", error);
    return res.status(500).json({ error: "Failed to export orders" });
  }
});

app.get("/export/products", apiKeyGate, apiRateLimit, subscriptionGate, async (req, res) => {
  try {
    if (!requireFeature(req.store, "csvExport")) {
      return res.status(403).json({ error: "Feature disabled: csvExport" });
    }
    const { storeId } = req;
    const parsedLimit = Number(req.query.limit);
    const hasLimit = req.query.limit !== undefined;
    if (hasLimit && (!Number.isFinite(parsedLimit) || parsedLimit <= 0 || parsedLimit > 1000)) {
      return res.status(400).json({ error: "Invalid limit (max 1000)" });
    }
    const limit = hasLimit ? parsedLimit : 500;

    // Security: always scope by storeId; keep exports small for MVP safety.
    const snapshot = await db.collection("products")
      .where("storeId", "==", storeId)
      .limit(limit)
      .get();

    const rows = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        productId: doc.id,
        name: data.name || "",
        currentStock: Number(data.currentStock || 0),
        price: Number(data.price || 0)
      };
    });

    const columns = ["productId", "name", "currentStock", "price"];
    const csv = toCsv(columns, rows);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"products.csv\"");
    return res.status(200).send(csv);
  } catch (error) {
    console.error("Products export error:", error);
    return res.status(500).json({ error: "Failed to export products" });
  }
});

exports.onAuthUserDelete = functions.auth.user().onDelete(async user => {
  const userId = String(user?.uid || "");
  if (!userId) return null;

  const ownerSnap = await admin.firestore()
    .collection("stores")
    .where("ownerUserId", "==", userId)
    .get();

  if (ownerSnap.empty) {
    return null;
  }

  const now = admin.firestore.Timestamp.now();
  const batch = admin.firestore().batch();
  ownerSnap.docs.forEach(doc => {
    batch.set(doc.ref, {
      plan: "inactive",
      ownerDeletedAt: now
    }, { merge: true });
  });
  await batch.commit();
  console.warn("Marked stores inactive for deleted auth user", {
    userId,
    storeCount: ownerSnap.size
  });
  return null;
});

exports.api = functions.https.onRequest(app);
