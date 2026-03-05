import { auth } from "./firebase.js";

const DEFAULT_API_BASE = "https://us-central1-metricmango-9f621.cloudfunctions.net/api";
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL
  || import.meta.env.VITE_API_BASE
  || DEFAULT_API_BASE
).replace(/\/+$/, "");
const USE_DUMMY_DATA = ["1", "true", "yes", "on"].includes(
  String(import.meta.env.VITE_USE_DUMMY_DATA || "").trim().toLowerCase()
);
const DUMMY_DATASET_NAME = String(import.meta.env.VITE_DUMMY_DATASET || "high-sales").trim().toLowerCase();
const trialExpiredListeners = new Set();
const unauthorizedListeners = new Set();
const DUMMY_STORE_ID = "demo-store-001";
const DUMMY_PRICING = {
  billingProvider: "razorpay",
  currency: "INR",
  amount: 499,
  interval: "month",
  trialDays: 7
};
const DUMMY_INVENTORY_SETTINGS = {
  lowStockAlertsEnabled: true,
  lowStockThresholdDays: 5,
  lowStockThresholdUnits: null,
  alertFrequency: "daily",
  alertRecipientEmail: "owner@metricmango.local",
  salesSpikeAlertsEnabled: true,
  salesSpikeThresholdPercent: 30,
  defaultLeadTimeDays: 7,
  safetyBufferDays: 0,
  weeklyActionPlanEnabled: true
};

function resolveDummyDatasetName(value) {
  if (["high", "high-sales", "pro", "pro-high"].includes(value)) return "high-sales";
  if (["low", "low-sales", "pro-low"].includes(value)) return "low-sales";
  return "high-sales";
}

const DUMMY_DATASETS = {
  "high-sales": {
    overview: {
      totalRevenue: 128450,
      totalOrders: 143,
      last7DaysRevenue: 28990,
      plan: "paid",
      trialDaysLeft: null,
      trial: { active: false, days: 7, startAt: null, endAt: null }
    },
    products: [
      { id: "prod_hoodie", storeId: DUMMY_STORE_ID, name: "Mango Hoodie", currentStock: 38, price: 1499, leadTimeDays: 10, supplierName: "Urban Loom" },
      { id: "prod_tshirt", storeId: DUMMY_STORE_ID, name: "Mango Tee", currentStock: 62, price: 899, leadTimeDays: 7, supplierName: "Cotton Trail" },
      { id: "prod_cap", storeId: DUMMY_STORE_ID, name: "Mango Cap", currentStock: 24, price: 599, leadTimeDays: 6, supplierName: "Peak Stitch" },
      { id: "prod_bottle", storeId: DUMMY_STORE_ID, name: "Mango Bottle", currentStock: 17, price: 799, leadTimeDays: 8, supplierName: "Hydra Works" }
    ],
    forecast: {
      data: [
        { productId: "prod_hoodie", forecast: { ma7: 6.1, ma14: 5.4, ma30: 4.9, next7Days: 42.7 } },
        { productId: "prod_tshirt", forecast: { ma7: 8.0, ma14: 7.2, ma30: 6.5, next7Days: 56.0 } },
        { productId: "prod_cap", forecast: { ma7: 3.3, ma14: 3.0, ma30: 2.7, next7Days: 23.1 } },
        { productId: "prod_bottle", forecast: { ma7: 2.8, ma14: 2.5, ma30: 2.1, next7Days: 19.6 } }
      ]
    },
    restockBase: {
      prod_hoodie: { avgDailySales: 6.1 },
      prod_tshirt: { avgDailySales: 8.0 },
      prod_cap: { avgDailySales: 3.3 },
      prod_bottle: { avgDailySales: 2.8 }
    },
    momentum: {
      defaultWindowDays: 7,
      windows: {
        7: {
          current: { orders: 46, revenue: 28990, avgOrderValue: 630.22, repeatOrderRate: 31.5 },
          previous: { orders: 34, revenue: 21470, avgOrderValue: 631.47, repeatOrderRate: 24.2 },
          trendPercent: 35.29,
          status: "growing",
          currentSeries: [4, 5, 6, 7, 8, 7, 9],
          currentRevenueSeries: [2500, 3400, 3600, 4200, 4700, 4300, 6290]
        },
        14: {
          current: { orders: 84, revenue: 51740, avgOrderValue: 615.95, repeatOrderRate: 29.8 },
          previous: { orders: 69, revenue: 43490, avgOrderValue: 630.28, repeatOrderRate: 22.7 },
          trendPercent: 21.74,
          status: "growing",
          currentSeries: [5, 6, 5, 7, 6, 7, 8, 6, 7, 7, 8, 6, 8, 8],
          currentRevenueSeries: [2800, 3100, 2900, 3500, 3300, 3400, 4200, 3200, 3600, 3500, 4300, 3100, 4400, 4340]
        },
        30: {
          current: { orders: 143, revenue: 128450, avgOrderValue: 898.25, repeatOrderRate: 27.1 },
          previous: { orders: 121, revenue: 106700, avgOrderValue: 881.82, repeatOrderRate: 21.3 },
          trendPercent: 18.18,
          status: "growing",
          currentSeries: [4, 3, 5, 6, 4, 5, 6, 5, 4, 6, 5, 7, 6, 5, 4, 6, 7, 5, 6, 5, 6, 5, 7, 6, 5, 6, 7, 8, 6, 7],
          currentRevenueSeries: [2600, 2200, 2900, 3100, 2500, 2800, 3200, 3000, 2600, 3300, 2900, 3600, 3400, 3000, 2700, 3500, 3800, 3100, 3300, 3000, 3400, 3200, 3900, 3600, 3300, 3500, 4000, 4300, 3600, 3900]
        }
      }
    },
    csv: {
      orders: [
        "orderId,productId,quantity,price,createdAt",
        "MM-1001,prod_hoodie,2,1499,2026-02-10T09:20:00.000Z",
        "MM-1002,prod_tshirt,1,899,2026-02-11T11:34:00.000Z",
        "MM-1003,prod_cap,3,599,2026-02-12T14:48:00.000Z",
        "MM-1004,prod_bottle,2,799,2026-02-13T16:15:00.000Z"
      ].join("\n")
    }
  },
  "low-sales": {
    overview: {
      totalRevenue: 11240,
      totalOrders: 19,
      last7DaysRevenue: 1840,
      plan: "paid",
      trialDaysLeft: null,
      trial: { active: false, days: 7, startAt: null, endAt: null }
    },
    products: [
      { id: "prod_hoodie", storeId: DUMMY_STORE_ID, name: "Mango Hoodie", currentStock: 74, price: 1499, leadTimeDays: 7, supplierName: "Urban Loom" },
      { id: "prod_tshirt", storeId: DUMMY_STORE_ID, name: "Mango Tee", currentStock: 98, price: 899, leadTimeDays: 7, supplierName: "Cotton Trail" },
      { id: "prod_cap", storeId: DUMMY_STORE_ID, name: "Mango Cap", currentStock: 51, price: 599, leadTimeDays: 5, supplierName: "Peak Stitch" },
      { id: "prod_bottle", storeId: DUMMY_STORE_ID, name: "Mango Bottle", currentStock: 46, price: 799, leadTimeDays: 6, supplierName: "Hydra Works" }
    ],
    forecast: {
      data: [
        { productId: "prod_hoodie", forecast: { ma7: 1.0, ma14: 0.9, ma30: 0.8, next7Days: 7.0 } },
        { productId: "prod_tshirt", forecast: { ma7: 1.2, ma14: 1.1, ma30: 0.9, next7Days: 8.4 } },
        { productId: "prod_cap", forecast: { ma7: 0.6, ma14: 0.5, ma30: 0.4, next7Days: 4.2 } },
        { productId: "prod_bottle", forecast: { ma7: 0.5, ma14: 0.4, ma30: 0.3, next7Days: 3.5 } }
      ]
    },
    restockBase: {
      prod_hoodie: { avgDailySales: 1.0 },
      prod_tshirt: { avgDailySales: 1.2 },
      prod_cap: { avgDailySales: 0.6 },
      prod_bottle: { avgDailySales: 0.5 }
    },
    momentum: {
      defaultWindowDays: 7,
      windows: {
        7: {
          current: { orders: 6, revenue: 1840, avgOrderValue: 306.67, repeatOrderRate: 8.3 },
          previous: { orders: 9, revenue: 2760, avgOrderValue: 306.67, repeatOrderRate: 11.1 },
          trendPercent: -33.33,
          status: "slowing",
          currentSeries: [1, 0, 1, 1, 0, 1, 2],
          currentRevenueSeries: [320, 0, 280, 300, 0, 340, 600]
        },
        14: {
          current: { orders: 11, revenue: 3420, avgOrderValue: 310.91, repeatOrderRate: 9.1 },
          previous: { orders: 14, revenue: 4260, avgOrderValue: 304.29, repeatOrderRate: 12.5 },
          trendPercent: -21.43,
          status: "slowing",
          currentSeries: [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1],
          currentRevenueSeries: [260, 320, 0, 280, 300, 0, 310, 290, 0, 320, 300, 340, 0, 400]
        },
        30: {
          current: { orders: 19, revenue: 11240, avgOrderValue: 591.58, repeatOrderRate: 10.5 },
          previous: { orders: 22, revenue: 12410, avgOrderValue: 564.09, repeatOrderRate: 12.0 },
          trendPercent: -13.64,
          status: "slowing",
          currentSeries: [0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1],
          currentRevenueSeries: [0, 280, 0, 320, 290, 0, 310, 300, 0, 290, 310, 0, 320, 340, 0, 0, 360, 0, 380, 330, 0, 300, 0, 340, 320, 0, 360, 370, 0, 390]
        }
      }
    },
    csv: {
      orders: [
        "orderId,productId,quantity,price,createdAt",
        "MM-2001,prod_hoodie,1,1499,2026-02-10T09:20:00.000Z",
        "MM-2002,prod_tshirt,1,899,2026-02-12T11:34:00.000Z",
        "MM-2003,prod_cap,1,599,2026-02-13T16:15:00.000Z"
      ].join("\n")
    }
  }
};

const dummyInventorySettingsState = {
  "high-sales": { ...DUMMY_INVENTORY_SETTINGS },
  "low-sales": { ...DUMMY_INVENTORY_SETTINGS }
};
const dummySuppliersState = {
  "high-sales": [
    { id: "sup_urbanloom", name: "Urban Loom", contactEmail: "ops@urbanloom.test", defaultLeadTimeDays: 10, notes: "Main apparel supplier" },
    { id: "sup_cottontrail", name: "Cotton Trail", contactEmail: "orders@cottontrail.test", defaultLeadTimeDays: 7, notes: "Tees and cotton basics" },
    { id: "sup_peakstitch", name: "Peak Stitch", contactEmail: "hello@peakstitch.test", defaultLeadTimeDays: 6, notes: "Accessories and caps" },
    { id: "sup_hydraworks", name: "Hydra Works", contactEmail: "purchasing@hydraworks.test", defaultLeadTimeDays: 8, notes: "Drinkware and bottles" }
  ],
  "low-sales": [
    { id: "sup_urbanloom", name: "Urban Loom", contactEmail: "ops@urbanloom.test", defaultLeadTimeDays: 7, notes: "Main apparel supplier" },
    { id: "sup_cottontrail", name: "Cotton Trail", contactEmail: "orders@cottontrail.test", defaultLeadTimeDays: 7, notes: "Tees and cotton basics" },
    { id: "sup_peakstitch", name: "Peak Stitch", contactEmail: "hello@peakstitch.test", defaultLeadTimeDays: 5, notes: "Accessories and caps" },
    { id: "sup_hydraworks", name: "Hydra Works", contactEmail: "purchasing@hydraworks.test", defaultLeadTimeDays: 6, notes: "Drinkware and bottles" }
  ]
};
const dummyPurchaseOrdersState = {
  "high-sales": [],
  "low-sales": []
};
const dummyRetentionState = {
  "high-sales": {
    engagement: {
      lastActiveAt: "2026-03-05T09:00:00.000Z",
      lastActivePage: "dashboard"
    },
    latestRequest: null
  },
  "low-sales": {
    engagement: {
      lastActiveAt: "2026-02-15T09:00:00.000Z",
      lastActivePage: "pricing"
    },
    latestRequest: null
  }
};

function roundToTwo(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function getDummyDataset() {
  const selected = resolveDummyDatasetName(DUMMY_DATASET_NAME);
  return DUMMY_DATASETS[selected];
}

function getDummyInventorySettings(datasetName = DUMMY_DATASET_NAME) {
  return {
    ...DUMMY_INVENTORY_SETTINGS,
    ...(dummyInventorySettingsState[resolveDummyDatasetName(datasetName)] || {})
  };
}

function getDummySuppliers(datasetName = DUMMY_DATASET_NAME) {
  const selected = resolveDummyDatasetName(datasetName);
  const dataset = getDummyDataset();
  const suppliers = dummySuppliersState[selected] || [];
  return suppliers.map(supplier => {
    const linkedProducts = (dataset.products || []).filter(product => String(product.supplierName || "") === String(supplier.name || ""));
    return {
      ...supplier,
      linkedProductCount: linkedProducts.length,
      linkedProducts: linkedProducts.map(product => ({
        productId: product.id,
        name: product.name
      }))
    };
  });
}

function computeDummyRestock(datasetName = DUMMY_DATASET_NAME, leadTimeOverride) {
  const selected = resolveDummyDatasetName(datasetName);
  const dataset = DUMMY_DATASETS[selected];
  const settings = getDummyInventorySettings(selected);
  const supplierMap = new Map(getDummySuppliers(selected).map(item => [item.name, item]));
  const safetyBufferDays = Number(settings.safetyBufferDays || 0);
  const suggestions = dataset.products.map(product => {
    const avgDailySales = Number(dataset.restockBase?.[product.id]?.avgDailySales || 0);
    const leadTimeDays = Number(leadTimeOverride || product.leadTimeDays || settings.defaultLeadTimeDays || 7);
    const planningWindowDays = leadTimeDays + safetyBufferDays;
    const expectedDemand = roundToTwo(avgDailySales * planningWindowDays);
    const requiredUnits = Math.max(0, Math.ceil(expectedDemand - Number(product.currentStock || 0)));
    const supplier = supplierMap.get(String(product.supplierName || ""));
    return {
      productId: product.id,
      name: product.name,
      supplierId: supplier?.id || "",
      supplierName: product.supplierName || "",
      leadTimeDays,
      safetyBufferDays,
      planningWindowDays,
      currentStock: Number(product.currentStock || 0),
      avgDailySales,
      expectedDemand,
      daysUntilStockout: avgDailySales > 0 ? roundToTwo(Number(product.currentStock || 0) / avgDailySales) : Number.POSITIVE_INFINITY,
      requiredUnits,
      recommendedReorderQty: requiredUnits,
      revenueAtRisk: roundToTwo(requiredUnits * Number(product.price || 0)),
      price: Number(product.price || 0),
      suggestion: requiredUnits > 0 ? "RESTOCK" : "SAFE"
    };
  });

  return {
    leadTimeDays: Number(leadTimeOverride || settings.defaultLeadTimeDays || 7),
    safetyBufferDays,
    suggestions
  };
}

function buildDummySkuAnalytics(datasetName = DUMMY_DATASET_NAME) {
  const dataset = DUMMY_DATASETS[resolveDummyDatasetName(datasetName)];
  const restockData = computeDummyRestock(datasetName);
  const rows = (dataset.products || []).map(product => {
    const avgDailySales = Number(dataset.restockBase?.[product.id]?.avgDailySales || 0);
    const restock = restockData.suggestions.find(item => item.productId === product.id) || {};
    const sold7 = Math.round(avgDailySales * 7);
    const sold30 = Math.round(avgDailySales * 30);
    const sellThroughRate30 = sold30 + Number(product.currentStock || 0) > 0
      ? roundToTwo((sold30 / (sold30 + Number(product.currentStock || 0))) * 100)
      : 0;
    const trendPercent = dataset === DUMMY_DATASETS["high-sales"]
      ? roundToTwo(12 + avgDailySales * 2)
      : roundToTwo(-8 - avgDailySales * 2);
    return {
      productId: product.id,
      name: product.name,
      currentStock: Number(product.currentStock || 0),
      sold7,
      sold30,
      avgDailySales7: roundToTwo(avgDailySales),
      avgDailySales30: roundToTwo(sold30 / 30),
      sellThroughRate30,
      stockCoverDays: restock.daysUntilStockout,
      trendPercent,
      trendDirection: trendPercent >= 10 ? "up" : trendPercent <= -10 ? "down" : "flat",
      velocityBand: avgDailySales >= 5 ? "fast" : avgDailySales >= 1.5 ? "steady" : avgDailySales > 0 ? "slow" : "inactive"
    };
  });

  const summary = {
    avgSellThroughRate30: roundToTwo(rows.reduce((sum, item) => sum + Number(item.sellThroughRate30 || 0), 0) / Math.max(rows.length, 1)),
    avgStockCoverDays: roundToTwo(rows.reduce((sum, item) => sum + (Number.isFinite(item.stockCoverDays) ? Number(item.stockCoverDays) : 0), 0) / Math.max(rows.length, 1)),
    trackedSkus: rows.length,
    growingSkus: rows.filter(item => item.trendDirection === "up").length,
    slippingSkus: rows.filter(item => item.trendDirection === "down").length
  };

  return {
    generatedAt: new Date().toISOString(),
    summary,
    fastMovers: [...rows].sort((a, b) => b.avgDailySales7 - a.avgDailySales7).slice(0, 5),
    slowMovers: [...rows].sort((a, b) => a.avgDailySales7 - b.avgDailySales7).slice(0, 5),
    rows
  };
}

function buildDummyPurchaseOrderCsv(datasetName, purchaseOrderId) {
  const selected = resolveDummyDatasetName(datasetName);
  const purchaseOrder = (dummyPurchaseOrdersState[selected] || []).find(item => item.id === purchaseOrderId);
  if (!purchaseOrder) {
    throw new ApiError("Purchase order not found", 404, { error: "not_found" });
  }
  return [
    "purchaseOrderId,supplierName,status,productId,name,currentStock,avgDailySales,leadTimeDays,planningWindowDays,recommendedReorderQty,revenueAtRisk",
    ...(purchaseOrder.lineItems || []).map(item => (
      `${purchaseOrder.id},${purchaseOrder.supplierName},${purchaseOrder.status},${item.productId},${item.name},${item.currentStock},${item.avgDailySales},${item.leadTimeDays},${item.planningWindowDays},${item.recommendedReorderQty},${item.revenueAtRisk}`
    ))
  ].join("\n");
}

function getDummyCsv(type) {
  const dataset = getDummyDataset();
  if (type === "orders") {
    return dataset.csv.orders;
  }
  if (type === "restock-plan") {
    const restock = computeDummyRestock();
    return [
      "productId,name,supplierName,currentStock,avgDailySales,leadTimeDays,safetyBufferDays,planningWindowDays,expectedDemand,recommendedReorderQty,revenueAtRisk,suggestion",
      ...restock.suggestions.map(item => (
        `${item.productId},${item.name},${item.supplierName},${item.currentStock},${item.avgDailySales},${item.leadTimeDays},${item.safetyBufferDays},${item.planningWindowDays},${item.expectedDemand},${item.recommendedReorderQty},${item.revenueAtRisk},${item.suggestion}`
      ))
    ].join("\n");
  }

  return [
    "productId,name,currentStock,price",
    ...dataset.products.map(item => `${item.id},${item.name},${item.currentStock},${item.price}`)
  ].join("\n");
}

async function requestDummy(path, options = {}) {
  const rawPath = String(path || "");
  const [pathname, queryString = ""] = rawPath.split("?");
  const params = new URLSearchParams(queryString);
  const parseJson = options.parseJson !== false;
  const datasetName = resolveDummyDatasetName(DUMMY_DATASET_NAME);
  const dataset = getDummyDataset();

  if (pathname === "/health") return { ok: true, mode: "dummy", dataset: datasetName };
  if (pathname === "/auth/bootstrap") return { userId: "demo-user", storeId: DUMMY_STORE_ID, onboardingCompleted: true, created: false };
  if (pathname === "/auth/complete-signup") return { ok: true, userId: "demo-user", storeId: DUMMY_STORE_ID, created: false, createdStore: false };
  if (pathname === "/onboarding/complete") return { ok: true, onboardingCompleted: true };
  if (pathname === "/onboarding/status") return { storeConnected: true, ordersSyncing: true, trialDaysLeft: 0, checklist: { webhookActive: true, trialStarted: true } };
  if (pathname === "/shopify/connect") return { message: "Dummy mode enabled. Shopify connection is simulated." };
  if (pathname === "/shopify/disconnect") return { ok: true, message: "Dummy mode enabled. Shopify disconnection is simulated." };
  if (pathname === "/dashboard/overview") return dataset.overview;
  if (pathname === "/dashboard/products") return { products: dataset.products };
  if (pathname === "/forecast") return dataset.forecast;
  if (pathname === "/restock-suggestions") {
    const leadTimeDays = Number(params.get("leadTimeDays"));
    return computeDummyRestock(datasetName, Number.isFinite(leadTimeDays) && leadTimeDays > 0 ? leadTimeDays : undefined);
  }
  if (pathname === "/dashboard/momentum") return dataset.momentum;
  if (pathname === "/dashboard/sku-analytics") return buildDummySkuAnalytics(datasetName);
  if (pathname === "/settings/inventory") {
    if ((options.method || "GET").toUpperCase() === "PATCH") {
      const payload = options.body ? JSON.parse(options.body) : {};
      dummyInventorySettingsState[datasetName] = {
        ...getDummyInventorySettings(datasetName),
        ...payload
      };
    }
    return getDummyInventorySettings(datasetName);
  }
  if (pathname === "/suppliers") {
    const method = (options.method || "GET").toUpperCase();
    if (method === "POST") {
      const payload = options.body ? JSON.parse(options.body) : {};
      const supplier = {
        id: `sup_${Date.now()}`,
        name: String(payload.name || "").trim(),
        contactEmail: String(payload.contactEmail || "").trim().toLowerCase(),
        defaultLeadTimeDays: Number(payload.defaultLeadTimeDays || 7),
        notes: String(payload.notes || "").trim()
      };
      dummySuppliersState[datasetName] = [...getDummySuppliers(datasetName).map(({ linkedProductCount, linkedProducts, ...item }) => item), supplier];
      return {
        ...supplier,
        linkedProductCount: 0,
        linkedProducts: []
      };
    }
    return { suppliers: getDummySuppliers(datasetName) };
  }
  if (pathname.startsWith("/suppliers/")) {
    const supplierId = pathname.split("/")[2];
    const payload = options.body ? JSON.parse(options.body) : {};
    const suppliers = getDummySuppliers(datasetName).map(({ linkedProductCount, linkedProducts, ...item }) => item);
    const index = suppliers.findIndex(item => item.id === supplierId);
    if (index === -1) {
      throw new ApiError("Supplier not found", 404, { error: "not_found" });
    }
    suppliers[index] = {
      ...suppliers[index],
      ...payload
    };
    dummySuppliersState[datasetName] = suppliers;
    return getDummySuppliers(datasetName).find(item => item.id === supplierId);
  }
  if (pathname.startsWith("/products/") && pathname.endsWith("/planning")) {
    const productId = pathname.split("/")[2];
    const payload = options.body ? JSON.parse(options.body) : {};
    const product = dataset.products.find(item => item.id === productId);
    if (!product) {
      throw new ApiError("Product not found", 404, { error: "not_found" });
    }
    if (Object.prototype.hasOwnProperty.call(payload, "leadTimeDays")) {
      product.leadTimeDays = Number(payload.leadTimeDays || product.leadTimeDays || 7);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "supplierId")) {
      product.supplierId = String(payload.supplierId || "");
    }
    if (Object.prototype.hasOwnProperty.call(payload, "supplierName")) {
      product.supplierName = String(payload.supplierName || "");
    }
    return {
      productId,
      leadTimeDays: product.leadTimeDays,
      supplierId: product.supplierId || "",
      supplierName: product.supplierName || ""
    };
  }
  if (pathname === "/purchase-orders") {
    return { purchaseOrders: dummyPurchaseOrdersState[datasetName] || [] };
  }
  if (pathname === "/purchase-orders/draft-from-restock") {
    const payload = options.body ? JSON.parse(options.body) : {};
    const suggestions = computeDummyRestock(datasetName).suggestions;
    const supplier = getDummySuppliers(datasetName).find(item => item.id === payload.supplierId)
      || { id: "", name: String(payload.supplierName || "Mixed suppliers") };
    const lineItems = suggestions.filter(item => {
      if (item.suggestion !== "RESTOCK") return false;
      if (payload.supplierId) return item.supplierId === payload.supplierId;
      if (payload.supplierName) return item.supplierName === payload.supplierName;
      return true;
    });
    if (!lineItems.length) {
      throw new ApiError("No restock items matched this purchase order draft", 400, { error: "no_items" });
    }
    const purchaseOrder = {
      id: `po_${Date.now()}`,
      supplierId: supplier.id || "",
      supplierName: supplier.name || "Mixed suppliers",
      status: "draft",
      notes: String(payload.notes || "").trim(),
      totals: {
        itemCount: lineItems.length,
        totalUnits: lineItems.reduce((sum, item) => sum + Number(item.recommendedReorderQty || 0), 0),
        totalRevenueAtRisk: lineItems.reduce((sum, item) => sum + Number(item.revenueAtRisk || 0), 0)
      },
      lineItems,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    dummyPurchaseOrdersState[datasetName] = [purchaseOrder, ...(dummyPurchaseOrdersState[datasetName] || [])];
    return purchaseOrder;
  }
  if (pathname.startsWith("/purchase-orders/")) {
    const purchaseOrderId = pathname.split("/")[2];
    const payload = options.body ? JSON.parse(options.body) : {};
    const orders = [...(dummyPurchaseOrdersState[datasetName] || [])];
    const index = orders.findIndex(item => item.id === purchaseOrderId);
    if (index === -1) {
      throw new ApiError("Purchase order not found", 404, { error: "not_found" });
    }
    orders[index] = {
      ...orders[index],
      ...payload,
      updatedAt: new Date().toISOString()
    };
    dummyPurchaseOrdersState[datasetName] = orders;
    return orders[index];
  }
  if (pathname === "/pricing") return DUMMY_PRICING;
  if (pathname === "/retention/status") {
    return {
      currentPlan: dataset.overview.plan || "active",
      lastActiveAt: dummyRetentionState[datasetName]?.engagement?.lastActiveAt || null,
      lastActivePage: dummyRetentionState[datasetName]?.engagement?.lastActivePage || "",
      inactiveDays: datasetName === "low-sales" ? 19 : 1,
      recommendedIntervention: datasetName === "low-sales" ? "reengage_now" : "healthy",
      latestRequest: dummyRetentionState[datasetName]?.latestRequest || null,
      saveOffers: {
        too_expensive: { title: "Keep Metric Mango for 25% less", description: "Take 25% off for the next 2 months.", primaryAction: "Request discount" },
        not_using_enough: { title: "Pause for 30 days instead", description: "Pause instead of cancelling.", primaryAction: "Request 30-day pause" },
        seasonal: { title: "Pause for 60 days", description: "Seasonal stores can pause instead.", primaryAction: "Request 60-day pause" }
      }
    };
  }
  if (pathname === "/retention/heartbeat") {
    const payload = options.body ? JSON.parse(options.body) : {};
    dummyRetentionState[datasetName] = {
      ...(dummyRetentionState[datasetName] || {}),
      engagement: {
        lastActiveAt: new Date().toISOString(),
        lastActivePage: String(payload.page || "dashboard")
      }
    };
    return { ok: true, page: String(payload.page || "dashboard") };
  }
  if (pathname === "/retention/pause-request" || pathname === "/retention/cancel-request") {
    const payload = options.body ? JSON.parse(options.body) : {};
    const type = pathname.includes("pause") ? "pause" : "cancel";
    const saveOffer = type === "pause"
      ? { title: payload.reason === "seasonal" ? "Pause for 60 days" : "Pause for 30 days" }
      : { title: "We received your cancellation request" };
    const latestRequest = {
      id: `ret_${Date.now()}`,
      type,
      reason: String(payload.reason || ""),
      status: "requested",
      createdAt: new Date().toISOString(),
      saveOffer
    };
    dummyRetentionState[datasetName] = {
      ...(dummyRetentionState[datasetName] || {}),
      latestRequest
    };
    return {
      requestId: latestRequest.id,
      type,
      status: "requested",
      pauseDays: type === "pause" ? (payload.reason === "seasonal" ? 60 : 30) : undefined,
      saveOffer
    };
  }
  if (pathname === "/billing/providers") {
    return {
      storeProvider: "razorpay",
      providers: [
        { provider: "razorpay", enabled: true },
        { provider: "lemonsqueezy", enabled: true },
        { provider: "paypal", enabled: true }
      ],
      availableProviders: ["razorpay", "lemonsqueezy", "paypal"]
    };
  }
  if (pathname === "/billing/upgrade") return { provider: "razorpay", checkoutUrl: "https://example.com/checkout" };
  // PayPal: simulated checkout URL for dummy mode.
  if (pathname === "/billing/paypal/subscribe") return { provider: "paypal", checkoutUrl: "https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=DUMMY" };
  if (pathname === "/export/orders") return parseJson ? { csv: getDummyCsv("orders") } : getDummyCsv("orders");
  if (pathname === "/export/products") return parseJson ? { csv: getDummyCsv("products") } : getDummyCsv("products");
  if (pathname === "/export/restock-plan") return parseJson ? { csv: getDummyCsv("restock-plan") } : getDummyCsv("restock-plan");
  if (pathname.startsWith("/export/purchase-orders/")) {
    const purchaseOrderId = pathname.split("/")[3];
    return parseJson ? { csv: buildDummyPurchaseOrderCsv(datasetName, purchaseOrderId) } : buildDummyPurchaseOrderCsv(datasetName, purchaseOrderId);
  }

  throw new ApiError(`Dummy mode has no handler for ${pathname}`, 404, { error: "not_found" });
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

function emitTrialExpired() {
  for (const listener of trialExpiredListeners) {
    try {
      listener();
    } catch {
      // Keep request flow resilient if a listener throws.
    }
  }
}

export function onTrialExpired(listener) {
  trialExpiredListeners.add(listener);
  return () => {
    trialExpiredListeners.delete(listener);
  };
}

function emitUnauthorized() {
  for (const listener of unauthorizedListeners) {
    try {
      listener();
    } catch {
      // Keep request flow resilient if a listener throws.
    }
  }
}

export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

async function request(path, options = {}) {
  if (USE_DUMMY_DATA) {
    return requestDummy(path, options);
  }

  const url = `${API_BASE}${path}`;
  const { parseJson = true, authToken, ...fetchOptions } = options;
  const fallbackToken = auth?.currentUser ? await auth.currentUser.getIdToken() : "";
  const bearerToken = String(authToken || fallbackToken || "").trim();
  const headers = {
    "content-type": "application/json",
    ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
    ...(fetchOptions.headers || {})
  };

  const response = await fetch(url, { ...fetchOptions, headers });
  const text = await response.text();
  let data = text || null;

  if (parseJson) {
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: "Invalid JSON response" };
    }
  }

  if (!response.ok) {
    const errorCode = String(data?.error || "").toLowerCase();
    const isTrialExpired = errorCode === "trial_expired";
    if (isTrialExpired) {
      emitTrialExpired();
    }

    const shouldTreatAsAuthIssue =
      response.status === 401
      || (response.status === 403 && !isTrialExpired)
      || errorCode === "unauthorized"
      || errorCode.includes("token");

    if (shouldTreatAsAuthIssue) {
      emitUnauthorized();
    }

    const message = data?.error || `Request failed (${response.status})`;
    throw new ApiError(message, response.status, data);
  }

  return data;
}

export function getHealth() {
  return request("/health");
}

export function bootstrapUserStore(authToken, country) {
  return request("/auth/bootstrap", {
    method: "POST",
    authToken,
    body: JSON.stringify({
      country: country || ""
    })
  });
}

export function completeSignup(authToken) {
  return request("/auth/complete-signup", {
    method: "POST",
    authToken
  });
}

export function completeOnboarding() {
  return request("/onboarding/complete", {
    method: "POST"
  });
}

export function connectShopifyStore(storeName) {
  return request("/shopify/connect", {
    method: "POST",
    body: JSON.stringify({ storeName })
  });
}

export function disconnectShopifyStore() {
  return request("/shopify/disconnect", {
    method: "POST"
  });
}

export function getOnboardingStatus() {
  return request("/onboarding/status");
}

export function getOverview() {
  return request("/dashboard/overview");
}

export function getProducts() {
  return request("/dashboard/products");
}

export function getSuppliers() {
  return request("/suppliers");
}

export function createSupplier(payload) {
  return request("/suppliers", {
    method: "POST",
    body: JSON.stringify(payload || {})
  });
}

export function updateSupplier(supplierId, payload) {
  return request(`/suppliers/${encodeURIComponent(supplierId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload || {})
  });
}

export function getInventorySettings() {
  return request("/settings/inventory");
}

export function updateInventorySettings(payload) {
  return request("/settings/inventory", {
    method: "PATCH",
    body: JSON.stringify(payload || {})
  });
}

export function updateProductPlanning(productId, payload) {
  return request(`/products/${encodeURIComponent(productId)}/planning`, {
    method: "PATCH",
    body: JSON.stringify(payload || {})
  });
}

export function getOrderMomentum() {
  return request("/dashboard/momentum");
}

export function getSkuAnalytics() {
  return request("/dashboard/sku-analytics");
}

export function getForecast() {
  return request("/forecast");
}

export function getRestockSuggestions() {
  return request("/restock-suggestions");
}

export function getPricing() {
  return request("/pricing");
}

export function getPurchaseOrders() {
  return request("/purchase-orders");
}

export function createPurchaseOrderDraft(payload) {
  return request("/purchase-orders/draft-from-restock", {
    method: "POST",
    body: JSON.stringify(payload || {})
  });
}

export function updatePurchaseOrder(purchaseOrderId, payload) {
  return request(`/purchase-orders/${encodeURIComponent(purchaseOrderId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload || {})
  });
}

export function getRetentionStatus() {
  return request("/retention/status");
}

export function postRetentionHeartbeat(page) {
  return request("/retention/heartbeat", {
    method: "POST",
    body: JSON.stringify({ page })
  });
}

export function requestPause(payload) {
  return request("/retention/pause-request", {
    method: "POST",
    body: JSON.stringify(payload || {})
  });
}

export function requestCancellation(payload) {
  return request("/retention/cancel-request", {
    method: "POST",
    body: JSON.stringify(payload || {})
  });
}

export function getBillingUpgradeUrl(redirectUrl) {
  const qs = redirectUrl
    ? `?json=1&redirectUrl=${encodeURIComponent(redirectUrl)}`
    : "?json=1";
  return request(`/billing/upgrade${qs}`, { method: "POST" });
}

// PayPal: dedicated checkout endpoint for PayPal subscriptions.
export function getPayPalCheckoutUrl(redirectUrl) {
  const qs = redirectUrl
    ? `?json=1&redirectUrl=${encodeURIComponent(redirectUrl)}`
    : "?json=1";
  return request(`/billing/paypal/subscribe${qs}`, { method: "POST" });
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function exportOrdersCsv() {
  const csv = await request("/export/orders", {
    parseJson: false
  });
  const content = typeof csv === "string" ? csv : JSON.stringify(csv);
  downloadBlob(content, "orders.csv", "text/csv;charset=utf-8;");
}

export async function exportProductsCsv() {
  const csv = await request("/export/products", {
    parseJson: false
  });
  const content = typeof csv === "string" ? csv : JSON.stringify(csv);
  downloadBlob(content, "products.csv", "text/csv;charset=utf-8;");
}

export async function exportRestockPlanCsv() {
  const csv = await request("/export/restock-plan", {
    parseJson: false
  });
  const content = typeof csv === "string" ? csv : JSON.stringify(csv);
  downloadBlob(content, "restock-plan.csv", "text/csv;charset=utf-8;");
}

export async function exportPurchaseOrderCsv(purchaseOrderId) {
  const csv = await request(`/export/purchase-orders/${encodeURIComponent(purchaseOrderId)}`, {
    parseJson: false
  });
  const content = typeof csv === "string" ? csv : JSON.stringify(csv);
  downloadBlob(content, `purchase-order-${purchaseOrderId}.csv`, "text/csv;charset=utf-8;");
}

export function getApiBase() {
  return API_BASE;
}
