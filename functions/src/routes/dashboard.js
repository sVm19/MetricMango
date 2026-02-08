const express = require("express");
const admin = require("firebase-admin");

const router = express.Router();
const TRIAL_DAYS = 7;

router.get("/overview", async (req, res) => {
  try {
    const { storeId } = req;
    if (!storeId) {
      return res.status(400).json({ error: "Missing storeId" });
    }
    const db = admin.firestore();
    // TODO: Consider caching overview aggregates per day if volume grows.
    // Security: always scope queries by storeId to prevent cross-store access.
    const ordersSnap = await db.collection("orders").where("storeId", "==", storeId).get();

    let totalRevenue = 0;
    let totalOrders = 0;
    let last7DaysRevenue = 0;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    ordersSnap.forEach(doc => {
      const data = doc.data();
      const amount = Number(data.totalAmount || 0);
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : null;

      totalRevenue += amount;
      totalOrders += 1;

      if (createdAt && createdAt >= sevenDaysAgo) {
        last7DaysRevenue += amount;
      }
    });

    const store = req.store || {};
    const plan = String(store.plan || "inactive");
    const trialStartDate = store.trialStartAt?.toDate ? store.trialStartAt.toDate() : null;
    const trialDays = TRIAL_DAYS;
    const trialEndDate = trialStartDate
      ? new Date(trialStartDate.getTime() + trialDays * 24 * 60 * 60 * 1000)
      : null;
    const trialActive = plan === "trial" && trialEndDate && new Date() <= trialEndDate;
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const rawTrialDaysLeft = plan === "trial" && trialEndDate
      ? Math.ceil((trialEndDate.getTime() - now.getTime()) / msPerDay)
      : 0;
    const trialDaysLeft = plan === "trial"
      ? Math.max(0, Math.min(trialDays, rawTrialDaysLeft))
      : null;

    return res.json({
      totalRevenue,
      totalOrders,
      last7DaysRevenue,
      plan,
      trialDaysLeft,
      trial: {
        active: Boolean(trialActive),
        days: trialDays,
        startAt: trialStartDate ? trialStartDate.toISOString() : null,
        endAt: trialEndDate ? trialEndDate.toISOString() : null
      }
    });
  } catch (error) {
    console.error("Overview error:", error);
    return res.status(500).json({ error: "Failed to load overview" });
  }
});

router.get("/products", async (req, res) => {
  try {
    const { storeId } = req;
    if (!storeId) {
      return res.status(400).json({ error: "Missing storeId" });
    }
    const db = admin.firestore();
    // Security: always scope queries by storeId to prevent cross-store access.
    const productsSnap = await db.collection("products").where("storeId", "==", storeId).get();
    const products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.json({ products });
  } catch (error) {
    console.error("Products error:", error);
    return res.status(500).json({ error: "Failed to load products" });
  }
});

module.exports = router;
