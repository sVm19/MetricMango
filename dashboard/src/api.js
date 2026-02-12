import { auth } from "./firebase.js";

const DEFAULT_API_BASE = "https://us-central1-metricmango-9f621.cloudfunctions.net/api";
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL
  || import.meta.env.VITE_API_BASE
  || DEFAULT_API_BASE
).replace(/\/+$/, "");
const trialExpiredListeners = new Set();
const unauthorizedListeners = new Set();

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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
