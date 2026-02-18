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
      { id: "prod_hoodie", storeId: DUMMY_STORE_ID, name: "Mango Hoodie", currentStock: 38, price: 1499 },
      { id: "prod_tshirt", storeId: DUMMY_STORE_ID, name: "Mango Tee", currentStock: 62, price: 899 },
      { id: "prod_cap", storeId: DUMMY_STORE_ID, name: "Mango Cap", currentStock: 24, price: 599 },
      { id: "prod_bottle", storeId: DUMMY_STORE_ID, name: "Mango Bottle", currentStock: 17, price: 799 }
    ],
    forecast: {
      data: [
        { productId: "prod_hoodie", forecast: { ma7: 6.1, ma14: 5.4, ma30: 4.9, next7Days: 42.7 } },
        { productId: "prod_tshirt", forecast: { ma7: 8.0, ma14: 7.2, ma30: 6.5, next7Days: 56.0 } },
        { productId: "prod_cap", forecast: { ma7: 3.3, ma14: 3.0, ma30: 2.7, next7Days: 23.1 } },
        { productId: "prod_bottle", forecast: { ma7: 2.8, ma14: 2.5, ma30: 2.1, next7Days: 19.6 } }
      ]
    },
    restock: {
      leadTimeDays: 7,
      suggestions: [
        { productId: "prod_hoodie", avgDailySales: 6.1, expectedDemand: 42.7, currentStock: 38, suggestion: "RESTOCK" },
        { productId: "prod_tshirt", avgDailySales: 8.0, expectedDemand: 56.0, currentStock: 62, suggestion: "SAFE" },
        { productId: "prod_cap", avgDailySales: 3.3, expectedDemand: 23.1, currentStock: 24, suggestion: "SAFE" },
        { productId: "prod_bottle", avgDailySales: 2.8, expectedDemand: 19.6, currentStock: 17, suggestion: "RESTOCK" }
      ]
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
      { id: "prod_hoodie", storeId: DUMMY_STORE_ID, name: "Mango Hoodie", currentStock: 74, price: 1499 },
      { id: "prod_tshirt", storeId: DUMMY_STORE_ID, name: "Mango Tee", currentStock: 98, price: 899 },
      { id: "prod_cap", storeId: DUMMY_STORE_ID, name: "Mango Cap", currentStock: 51, price: 599 },
      { id: "prod_bottle", storeId: DUMMY_STORE_ID, name: "Mango Bottle", currentStock: 46, price: 799 }
    ],
    forecast: {
      data: [
        { productId: "prod_hoodie", forecast: { ma7: 1.0, ma14: 0.9, ma30: 0.8, next7Days: 7.0 } },
        { productId: "prod_tshirt", forecast: { ma7: 1.2, ma14: 1.1, ma30: 0.9, next7Days: 8.4 } },
        { productId: "prod_cap", forecast: { ma7: 0.6, ma14: 0.5, ma30: 0.4, next7Days: 4.2 } },
        { productId: "prod_bottle", forecast: { ma7: 0.5, ma14: 0.4, ma30: 0.3, next7Days: 3.5 } }
      ]
    },
    restock: {
      leadTimeDays: 7,
      suggestions: [
        { productId: "prod_hoodie", avgDailySales: 1.0, expectedDemand: 7.0, currentStock: 74, suggestion: "SAFE" },
        { productId: "prod_tshirt", avgDailySales: 1.2, expectedDemand: 8.4, currentStock: 98, suggestion: "SAFE" },
        { productId: "prod_cap", avgDailySales: 0.6, expectedDemand: 4.2, currentStock: 51, suggestion: "SAFE" },
        { productId: "prod_bottle", avgDailySales: 0.5, expectedDemand: 3.5, currentStock: 46, suggestion: "SAFE" }
      ]
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

function getDummyDataset() {
  const selected = resolveDummyDatasetName(DUMMY_DATASET_NAME);
  return DUMMY_DATASETS[selected];
}

function getDummyCsv(type) {
  const dataset = getDummyDataset();
  if (type === "orders") {
    return dataset.csv.orders;
  }

  return [
    "productId,name,currentStock,price",
    ...dataset.products.map(item => `${item.id},${item.name},${item.currentStock},${item.price}`)
  ].join("\n");
}

async function requestDummy(path, options = {}) {
  const pathname = String(path || "").split("?")[0];
  const parseJson = options.parseJson !== false;
  const dataset = getDummyDataset();
  const datasetName = resolveDummyDatasetName(DUMMY_DATASET_NAME);

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
  if (pathname === "/restock-suggestions") return dataset.restock;
  if (pathname === "/dashboard/momentum") return dataset.momentum;
  if (pathname === "/pricing") return DUMMY_PRICING;
  if (pathname === "/billing/providers") {
    return {
      storeProvider: "razorpay",
      providers: [
        { provider: "razorpay", enabled: true },
        { provider: "lemonsqueezy", enabled: true }
      ],
      availableProviders: ["razorpay", "lemonsqueezy"]
    };
  }
  if (pathname === "/billing/upgrade") return { provider: "razorpay", checkoutUrl: "https://example.com/checkout" };
  if (pathname === "/export/orders") return parseJson ? { csv: getDummyCsv("orders") } : getDummyCsv("orders");
  if (pathname === "/export/products") return parseJson ? { csv: getDummyCsv("products") } : getDummyCsv("products");

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

export function getOrderMomentum() {
  return request("/dashboard/momentum");
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

export function getApiBase() {
  return API_BASE;
}
