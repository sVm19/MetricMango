const express = require("express");
const admin = require("firebase-admin");
const { computeRestockSuggestions } = require("../services/restockService");
const { buildSkuAnalytics } = require("../services/skuAnalyticsService");
const { resolveInventorySettings } = require("../services/inventorySettingsService");

const router = express.Router();
const TRIAL_DAYS = 7;

function toStartOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function periodRange(now, days) {
  const currentEnd = addDays(toStartOfDay(now), 1);
  const currentStart = addDays(currentEnd, -days);
  const previousEnd = currentStart;
  const previousStart = addDays(previousEnd, -days);
  return {
    currentStart,
    currentEnd,
    previousStart,
    previousEnd
  };
}

function createDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateKeysInRange(startInclusive, endExclusive) {
  const keys = [];
  let cursor = toStartOfDay(startInclusive);
  while (cursor < endExclusive) {
    keys.push(createDateKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return keys;
}

function toMetricsFromOrders(orderMap) {
  const orders = Array.from(orderMap.values());
  const ordersCount = orders.length;
  const revenue = orders.reduce((sum, order) => sum + Number(order.revenue || 0), 0);
  const customerOrderCounts = new Map();

  orders.forEach(order => {
    const customerId = String(order.customerId || "").trim();
    if (!customerId) return;
    customerOrderCounts.set(customerId, (customerOrderCounts.get(customerId) || 0) + 1);
  });

  const repeatOrderCount = Array.from(customerOrderCounts.values())
    .reduce((sum, count) => sum + (count > 1 ? count : 0), 0);
  const repeatOrderRate = ordersCount > 0 ? (repeatOrderCount / ordersCount) * 100 : null;

  return {
    orders: ordersCount,
    revenue,
    avgOrderValue: ordersCount > 0 ? revenue / ordersCount : 0,
    repeatOrderRate
  };
}

function computeTrendPercent(currentValue, previousValue) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) return 0;
  if (previousValue <= 0) {
    return currentValue > 0 ? 100 : 0;
  }
  return ((currentValue - previousValue) / previousValue) * 100;
}

function buildMomentumStatus(trendPercent) {
  if (trendPercent >= 10) return "growing";
  if (trendPercent <= -10) return "slowing";
  return "stable";
}

async function getCachedDashboardData(storeId, cacheKey, ttlMs, fetcher) {
  const db = admin.firestore();
  const cacheRef = db.collection("dashboard_cache").doc(`${storeId}_${cacheKey}`);

  try {
    const doc = await cacheRef.get();
    if (doc.exists) {
      const data = doc.data();
      const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate().getTime() : 0;
      if (Date.now() - updatedAt < ttlMs) {
        return data.payload;
      }
    }
  } catch (err) {
    console.warn("Dashboard cache read error:", err.message);
  }

  const payload = await fetcher();

  cacheRef.set({
    storeId,
    cacheKey,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    payload
  }).catch(err => console.warn("Dashboard cache write error:", err.message));

  return payload;
}

async function fetchOverviewStats(storeId) {
  const db = admin.firestore();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const baseQuery = db.collection("orders").where("storeId", "==", String(storeId));
  const [totalsResult, last7DaysResult] = await Promise.all([
    baseQuery.aggregate({
      totalRevenue: admin.firestore.AggregateField.sum("totalAmount"),
      totalOrders: admin.firestore.AggregateField.count()
    }).get(),
    baseQuery.where("createdAt", ">=", admin.firestore.Timestamp.fromDate(sevenDaysAgo))
      .aggregate({
        revenue7d: admin.firestore.AggregateField.sum("totalAmount")
      }).get()
  ]);

  return {
    totalRevenue: totalsResult.data().totalRevenue || 0,
    totalOrders: totalsResult.data().totalOrders || 0,
    last7DaysRevenue: last7DaysResult.data().revenue7d || 0
  };
}

router.get("/overview", async (req, res) => {
  try {
    const { storeId } = req;
    if (!storeId) {
      return res.status(400).json({ error: "Missing storeId" });
    }

    // Cache aggregates for 15 minutes to dramatically reduce DB costs
    const stats = await getCachedDashboardData(storeId, "overview_stats", 15 * 60 * 1000, () => fetchOverviewStats(storeId));

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
      ...stats,
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

async function fetchMomentumData(storeId) {
  const db = admin.firestore();
  const now = new Date();
  const periods = [7, 14, 30];
  const maxDays = Math.max(...periods);
  const { previousStart } = periodRange(now, maxDays);
  const queryStart = admin.firestore.Timestamp.fromDate(previousStart);

  const ordersSnap = await db.collection("orders")
    .where("storeId", "==", String(storeId))
    .where("createdAt", ">=", queryStart)
    .get();

  const lineItems = ordersSnap.docs
    .map(doc => doc.data() || {})
    .filter(item => Boolean(item.orderId) && Boolean(item.productId));

  const periodData = {};
  periods.forEach(days => {
    periodData[days] = {
      current: new Map(),
      previous: new Map(),
      seriesByDate: {},
      revenueByDate: {}
    };
    const range = periodRange(now, days);
    dateKeysInRange(range.currentStart, range.currentEnd).forEach(key => {
      periodData[days].seriesByDate[key] = new Set();
      periodData[days].revenueByDate[key] = 0;
    });
  });

  lineItems.forEach(item => {
    const createdAt = item.createdAt?.toDate ? item.createdAt.toDate() : null;
    if (!createdAt) return;

    periods.forEach(days => {
      const range = periodRange(now, days);
      const orderId = String(item.orderId);
      const bucket = {
        orderId,
        revenue: 0,
        customerId: item.customerId || ""
      };
      const amount = Number(item.price || 0) * Number(item.quantity || 0);

      if (createdAt >= range.currentStart && createdAt < range.currentEnd) {
        const existing = periodData[days].current.get(orderId) || bucket;
        existing.revenue += amount;
        if (!existing.customerId && item.customerId) existing.customerId = item.customerId;
        periodData[days].current.set(orderId, existing);

        const dateKey = createDateKey(createdAt);
        if (periodData[days].seriesByDate[dateKey]) {
          periodData[days].seriesByDate[dateKey].add(orderId);
          periodData[days].revenueByDate[dateKey] += amount;
        }
      } else if (createdAt >= range.previousStart && createdAt < range.previousEnd) {
        const existing = periodData[days].previous.get(orderId) || bucket;
        existing.revenue += amount;
        if (!existing.customerId && item.customerId) existing.customerId = item.customerId;
        periodData[days].previous.set(orderId, existing);
      }
    });
  });

  const momentum = {};
  periods.forEach(days => {
    const currentMetrics = toMetricsFromOrders(periodData[days].current);
    const previousMetrics = toMetricsFromOrders(periodData[days].previous);
    const trendPercent = computeTrendPercent(currentMetrics.orders, previousMetrics.orders);
    const status = buildMomentumStatus(trendPercent);
    const currentSeries = Object.entries(periodData[days].seriesByDate).map(([, orderSet]) => orderSet.size);
    const currentRevenueSeries = Object.entries(periodData[days].revenueByDate).map(([, revenue]) => Number(revenue || 0));

    momentum[days] = {
      current: currentMetrics,
      previous: previousMetrics,
      trendPercent,
      status,
      currentSeries,
      currentRevenueSeries
    };
  });

  return {
    defaultWindowDays: 7,
    windows: momentum
  };
}

router.get("/momentum", async (req, res) => {
  try {
    const { storeId } = req;
    if (!storeId) {
      return res.status(400).json({ error: "Missing storeId" });
    }

    const payload = await getCachedDashboardData(storeId, "momentum", 15 * 60 * 1000, () => fetchMomentumData(storeId));
    return res.json(payload);
  } catch (error) {
    console.error("Momentum error:", error);
    return res.status(500).json({ error: "Failed to load order momentum" });
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

async function fetchSkuAnalyticsData(storeId, storeObj) {
  const db = admin.firestore();
  const startDate = createDateKey(addDays(new Date(), -29));
  const [productsSnap, salesSnap, restockData] = await Promise.all([
    db.collection("products").where("storeId", "==", String(storeId)).get(),
    db.collection("daily_sales")
      .where("storeId", "==", String(storeId))
      .where("date", ">=", startDate)
      .get(),
    computeRestockSuggestions(storeId, {
      storeSettings: resolveInventorySettings(storeObj || {})
    })
  ]);

  const products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const salesByProduct = {};
  salesSnap.forEach(doc => {
    const data = doc.data() || {};
    const productId = String(data.productId || "");
    if (!productId) return;
    if (!salesByProduct[productId]) {
      salesByProduct[productId] = {};
    }
    salesByProduct[productId][String(data.date || "")] = Number(data.quantitySold || 0);
  });

  const restockByProductId = (restockData?.suggestions || []).reduce((acc, item) => {
    acc[String(item.productId || "")] = item;
    return acc;
  }, {});

  return buildSkuAnalytics({
    products,
    salesByProduct,
    restockByProductId,
    now: new Date()
  });
}

router.get("/sku-analytics", async (req, res) => {
  try {
    const { storeId } = req;
    if (!storeId) {
      return res.status(400).json({ error: "Missing storeId" });
    }

    // Cache SKU analytics for 15 minutes to save multiple heavy queries per user visit
    const payload = await getCachedDashboardData(storeId, "sku_analytics", 15 * 60 * 1000, () => fetchSkuAnalyticsData(storeId, req.store));
    return res.json(payload);
  } catch (error) {
    console.error("SKU analytics error:", error);
    return res.status(500).json({ error: "Failed to load SKU analytics" });
  }
});

async function fetchAnalyticsDataFn(storeId) {
  const db = admin.firestore();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const metricsSnap = await db.collection("store_metrics")
    .where("store_id", "==", String(storeId))
    .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(twentyFourHoursAgo))
    .orderBy("timestamp", "asc")
    .get();

  let revenueLast24Hours = 0;
  let totalOrders = 0;
  let totalVisitors = 0;
  const hourlyRevenueTrend = [];

  metricsSnap.forEach(doc => {
    const data = doc.data() || {};
    revenueLast24Hours += Number(data.revenue || 0);
    totalOrders += Number(data.orders || 0);
    totalVisitors += Number(data.visitors || 0);

    hourlyRevenueTrend.push({
      timestamp: data.timestamp ? data.timestamp.toDate().toISOString() : new Date().toISOString(),
      revenue: Number(data.revenue || 0),
      orders: Number(data.orders || 0)
    });
  });

  const conversionRate = totalVisitors > 0 ? (totalOrders / totalVisitors) * 100 : 0;

  // Top selling products over last 24h
  const ordersSnap = await db.collection("orders")
    .where("storeId", "==", String(storeId))
    .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(twentyFourHoursAgo))
    .get();

  const productTotals = {};
  ordersSnap.forEach(doc => {
    const data = doc.data();
    if (data.productId && data.quantity) {
      productTotals[data.productId] = (productTotals[data.productId] || 0) + Number(data.quantity || 0);
    }
  });

  const topSellingIds = Object.entries(productTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topSellingProducts = [];
  if (topSellingIds.length > 0) {
    const pIds = topSellingIds.map(tuple => tuple[0]);
    // Limit to max 30 for 'in' query safety, though slice(0,5) ensures we only have 5.
    const productsSnap = await db.collection("products")
      .where(admin.firestore.FieldPath.documentId(), "in", pIds)
      .get();

    const pNames = {};
    productsSnap.forEach(doc => pNames[doc.id] = doc.data().name || "Unknown");

    for (const [pId, qty] of topSellingIds) {
      topSellingProducts.push({
        productId: pId,
        name: pNames[pId] || "Unknown",
        quantitySold: qty
      });
    }
  }

  return {
    revenueLast24Hours,
    totalOrders,
    conversionRate,
    topSellingProducts,
    hourlyRevenueTrend
  };
}

router.get("/analytics", async (req, res) => {
  try {
    const { storeId } = req;
    if (!storeId) {
      return res.status(400).json({ error: "Missing storeId" });
    }

    // Cache for 55 seconds to dedup parallel hits and support 60s polling
    const payload = await getCachedDashboardData(storeId, "analytics", 55 * 1000, () => fetchAnalyticsDataFn(storeId));
    return res.json(payload);

  } catch (error) {
    console.error("Dashboard analytics error:", error);
    return res.status(500).json({ error: "Failed to load dashboard analytics" });
  }
});

router.get("/aggregated", async (req, res) => {
  try {
    const { storeId } = req;
    if (!storeId) {
      return res.status(400).json({ error: "Missing storeId" });
    }

    // Batch fetch all components the dashboard relies on
    const [momentum, skuAnalytics, analytics, productsData, restockData] = await Promise.all([
      getCachedDashboardData(storeId, "momentum", 15 * 60 * 1000, () => fetchMomentumData(storeId)),
      getCachedDashboardData(storeId, "sku_analytics", 15 * 60 * 1000, () => fetchSkuAnalyticsData(storeId, req.store)),
      getCachedDashboardData(storeId, "analytics", 55 * 1000, () => fetchAnalyticsDataFn(storeId)),
      admin.firestore().collection("products").where("storeId", "==", String(storeId)).get(),
      computeRestockSuggestions(storeId, { storeSettings: resolveInventorySettings(req.store || {}) })
    ]);

    return res.json({
      momentum,
      skuAnalytics,
      analytics,
      restockSuggestions: restockData,
      products: productsData.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    });
  } catch (error) {
    console.error("Dashboard aggregated error:", error);
    return res.status(500).json({ error: "Failed to load aggregated dashboard data" });
  }
});

module.exports = router;
