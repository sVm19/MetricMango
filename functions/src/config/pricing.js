// Centralized pricing for Metric Mango (backend-only source of truth).
// Keep provider-specific billing logic separate; providers should reference this config.
// India pricing uses INR 499; global pricing uses USD 9.

const PRICING = {
  india: {
    currency: "INR",
    amount: 499
  },
  global: {
    currency: "USD",
    amount: 9
  }
};

module.exports = {
  PRICING
};

