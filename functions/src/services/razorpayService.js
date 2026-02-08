const { getBillingConfig } = require("../utils/runtimeConfig");

function getRazorpayAuthHeader() {
  const { razorpay } = getBillingConfig();
  if (!razorpay.keyId || !razorpay.keySecret) {
    throw new Error("Missing Razorpay API credentials");
  }
  const token = Buffer.from(`${razorpay.keyId}:${razorpay.keySecret}`).toString("base64");
  return `Basic ${token}`;
}

async function createRazorpaySubscription({ planId, totalCount = 12, customerNotify = 1, notes = {} }) {
  if (!planId) {
    throw new Error("Missing Razorpay planId");
  }

  const response = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: {
      Authorization: getRazorpayAuthHeader(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      plan_id: planId,
      total_count: totalCount,
      customer_notify: customerNotify,
      notes
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Razorpay subscription create failed: ${response.status} ${body}`);
  }

  return response.json();
}

module.exports = {
  createRazorpaySubscription
};
