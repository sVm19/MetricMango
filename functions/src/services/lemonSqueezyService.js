const { getBillingConfig } = require("../utils/runtimeConfig");

function mapLemonSqueezyEventToPlan(eventName) {
  const normalized = String(eventName || "").toLowerCase();
  if (!normalized) return null;

  if (normalized === "subscription_created") return "active";
  if (normalized === "subscription_cancelled") return "inactive";
  if (normalized === "subscription_expired") return "inactive";

  return null;
}

async function createLemonSqueezyCheckout({ storeId, variantId, redirectUrl }) {
  const billingConfig = getBillingConfig();
  const apiKey = billingConfig.lemonSqueezy.apiKey;
  const lemonStoreId = billingConfig.lemonSqueezy.storeId;
  if (!apiKey || !lemonStoreId) {
    throw new Error("Missing Lemon Squeezy API credentials");
  }
  if (!variantId) {
    throw new Error("Missing Lemon Squeezy variantId");
  }

  const body = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_data: {
          custom: {
            storeId
          }
        }
      },
      relationships: {
        store: {
          data: { type: "stores", id: String(lemonStoreId) }
        },
        variant: {
          data: { type: "variants", id: String(variantId) }
        }
      }
    }
  };

  if (redirectUrl) {
    body.data.attributes.product_options = {
      redirect_url: redirectUrl
    };
  }

  const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Lemon Squeezy checkout failed: ${response.status} ${text}`);
  }

  return response.json();
}

module.exports = {
  mapLemonSqueezyEventToPlan,
  createLemonSqueezyCheckout
};
