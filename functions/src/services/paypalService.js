/**
 * PayPal Subscriptions API Service
 * ---------------------------------
 * Handles PayPal REST API interactions for subscription billing.
 * Uses OAuth2 client_credentials flow for authentication.
 *
 * This is an ALTERNATIVE payment provider alongside Lemon Squeezy.
 * Both providers converge on `stores.plan` for access control.
 */

const { getBillingConfig } = require("../utils/runtimeConfig");

// --- PayPal OAuth2 Access Token ---

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Obtain a PayPal OAuth2 access token using client credentials.
 * Tokens are cached in-memory until expiry.
 */
async function getPayPalAccessToken() {
    const now = Date.now();
    if (cachedToken && now < tokenExpiresAt) {
        return cachedToken;
    }

    const { paypal } = getBillingConfig();
    if (!paypal.clientId || !paypal.clientSecret) {
        throw new Error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET");
    }

    const auth = Buffer.from(`${paypal.clientId}:${paypal.clientSecret}`).toString("base64");
    const response = await fetch(`${paypal.apiBase}/v1/oauth2/token`, {
        method: "POST",
        headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "grant_type=client_credentials"
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`PayPal OAuth failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    cachedToken = data.access_token;
    // Expire 60 seconds early to avoid edge-case failures.
    tokenExpiresAt = now + (data.expires_in - 60) * 1000;
    return cachedToken;
}

// --- PayPal Product + Plan Management ---

/**
 * Create a PayPal catalog product (one-time setup).
 * Products are the top-level container for billing plans.
 */
async function createPayPalProduct({ name, description }) {
    const { paypal } = getBillingConfig();
    const accessToken = await getPayPalAccessToken();

    const response = await fetch(`${paypal.apiBase}/v1/catalogs/products`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: JSON.stringify({
            name: name || "Metric Mango Pro",
            description: description || "Shopify demand forecasting & restock alerts",
            type: "SERVICE",
            category: "SOFTWARE"
        })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`PayPal create product failed: ${response.status} ${text}`);
    }

    return response.json();
}

/**
 * Create a PayPal billing plan linked to a product.
 * Plans define the recurring price and billing cycle.
 */
async function createPayPalPlan({ productId, name, amount, currency }) {
    const { paypal } = getBillingConfig();
    const accessToken = await getPayPalAccessToken();

    const response = await fetch(`${paypal.apiBase}/v1/billing/plans`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: JSON.stringify({
            product_id: productId,
            name: name || "Metric Mango Monthly",
            description: "Monthly subscription — all features included",
            billing_cycles: [
                {
                    frequency: { interval_unit: "MONTH", interval_count: 1 },
                    tenure_type: "TRIAL",
                    sequence: 1,
                    total_cycles: 1,
                    pricing_scheme: {
                        fixed_price: { value: "0", currency_code: currency || "USD" }
                    }
                },
                {
                    frequency: { interval_unit: "MONTH", interval_count: 1 },
                    tenure_type: "REGULAR",
                    sequence: 2,
                    total_cycles: 0,
                    pricing_scheme: {
                        fixed_price: {
                            value: String(amount || 9),
                            currency_code: currency || "USD"
                        }
                    }
                }
            ],
            payment_preferences: {
                auto_bill_outstanding: true,
                payment_failure_threshold: 3
            }
        })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`PayPal create plan failed: ${response.status} ${text}`);
    }

    return response.json();
}

// --- PayPal Subscription Checkout ---

/**
 * Create a PayPal subscription and return the approval URL.
 * The `custom_id` field carries the Metric Mango storeId for webhook resolution.
 *
 * @param {object} options
 * @param {string} options.planId - PayPal billing plan ID (from env or created via API)
 * @param {string} options.storeId - Internal Metric Mango store ID
 * @param {string} [options.returnUrl] - URL to redirect after PayPal approval
 * @param {string} [options.cancelUrl] - URL to redirect if user cancels
 * @returns {Promise<{subscriptionId: string, approvalUrl: string}>}
 */
async function createPayPalSubscription({ planId, storeId, returnUrl, cancelUrl }) {
    const { paypal } = getBillingConfig();
    if (!planId) {
        throw new Error("Missing PayPal planId");
    }

    const accessToken = await getPayPalAccessToken();

    const body = {
        plan_id: planId,
        // custom_id is returned in webhooks — used to resolve internal storeId.
        custom_id: String(storeId || ""),
        application_context: {
            brand_name: "Metric Mango",
            logo_url: "https://metricmango.store/favicon.png",
            shipping_preference: "NO_SHIPPING",
            user_action: "SUBSCRIBE_NOW",
            return_url: returnUrl || "https://metricmango.store/dashboard",
            cancel_url: cancelUrl || "https://metricmango.store/dashboard"
        }
    };

    const response = await fetch(`${paypal.apiBase}/v1/billing/subscriptions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`PayPal create subscription failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    const approvalLink = (data.links || []).find(link => link.rel === "approve");
    const approvalUrl = approvalLink?.href || "";

    return {
        subscriptionId: data.id || "",
        approvalUrl,
        status: data.status || "APPROVAL_PENDING"
    };
}

// --- PayPal Webhook Verification ---

/**
 * Verify a PayPal webhook signature by calling the PayPal API.
 * This is more reliable than local HMAC because PayPal signs with their own certs.
 *
 * @param {object} options
 * @param {object} options.headers - Request headers from the webhook
 * @param {string} options.rawBody - Raw request body as string
 * @returns {Promise<boolean>}
 */
async function verifyPayPalWebhookSignature({ headers, rawBody }) {
    const { paypal } = getBillingConfig();
    const webhookId = paypal.webhookId;
    if (!webhookId) {
        throw new Error("Missing PAYPAL_WEBHOOK_ID for webhook verification");
    }

    const accessToken = await getPayPalAccessToken();

    const verifyBody = {
        auth_algo: headers["paypal-auth-algo"] || "",
        cert_url: headers["paypal-cert-url"] || "",
        transmission_id: headers["paypal-transmission-id"] || "",
        transmission_sig: headers["paypal-transmission-sig"] || "",
        transmission_time: headers["paypal-transmission-time"] || "",
        webhook_id: webhookId,
        webhook_event: JSON.parse(rawBody)
    };

    const response = await fetch(`${paypal.apiBase}/v1/notifications/verify-webhook-signature`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(verifyBody)
    });

    if (!response.ok) {
        const text = await response.text();
        console.error("PayPal webhook verification API error:", { status: response.status, body: text });
        return false;
    }

    const result = await response.json();
    return result.verification_status === "SUCCESS";
}

// --- PayPal Event Mapping ---

/**
 * Map a PayPal webhook event type to an internal plan status.
 * Returns null for events that should be ignored.
 *
 * @param {string} eventType - PayPal event type string
 * @returns {"active" | "inactive" | null}
 */
function mapPayPalEventToPlan(eventType) {
    const normalized = String(eventType || "").toUpperCase();

    // Subscription became active (initial activation or reactivation).
    if (normalized === "BILLING.SUBSCRIPTION.ACTIVATED") return "active";

    // Subscription cancelled, suspended, or expired — revoke access.
    if (normalized === "BILLING.SUBSCRIPTION.CANCELLED") return "inactive";
    if (normalized === "BILLING.SUBSCRIPTION.SUSPENDED") return "inactive";
    if (normalized === "BILLING.SUBSCRIPTION.EXPIRED") return "inactive";

    // Payment completed — log but don't change plan (subscription activation handles it).
    // BILLING.SUBSCRIPTION.CREATED — subscription created but not yet approved.
    return null;
}

module.exports = {
    getPayPalAccessToken,
    createPayPalProduct,
    createPayPalPlan,
    createPayPalSubscription,
    verifyPayPalWebhookSignature,
    mapPayPalEventToPlan
};
