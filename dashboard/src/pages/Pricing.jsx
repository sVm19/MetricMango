import React, { useEffect, useState } from "react";
import Button from "../components/Button.jsx";
import { getPricing } from "../api.js";

const PLAN = {
  name: "Metric Mango Pro",
  description: "Built for small ecommerce teams.",
  features: [
    "Full analytics",
    "Sales forecasting",
    "Restock suggestions",
    "Email alerts",
    "CSV exports",
    "Priority support"
  ],
  cta: "Start free trial"
};

function formatPrice(amount, currency) {
  if (!currency || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amount);
}

export default function Pricing() {
  const [pricing, setPricing] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await getPricing();
        if (!active) return;
        setPricing(data);
      } catch (error) {
        if (!active) return;
        setPricing(null);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const currency = pricing?.currency;
  const monthlyAmount = pricing?.amount;
  const trialDays = Number.isFinite(pricing?.trialDays) ? pricing.trialDays : 7;
  const monthlyLabel = formatPrice(monthlyAmount, currency);

  return (
    <div className="pricing-page">
      <div className="pricing-hero">
        <div>
          <h2>One plan. All features.</h2>
          <p className="pricing-subtitle">
            No tiers. No upsells.
          </p>
        </div>
      </div>

      <div className="pricing-grid single">
        <div className="pricing-card">
          <div>
            <div className="plan-eyebrow">{PLAN.name}</div>
            <h3>All features included</h3>
            <div className="price">
              {formatPrice(monthlyAmount, currency)}
              <span className="price-suffix">/ month</span>
            </div>
            <p className="price-description">{PLAN.description}</p>
            <div className="trial-note">
              {trialDays} days free. Then {monthlyLabel || "₹499"}/month.
            </div>
          </div>

          <ul className="feature-list">
            {PLAN.features.map(feature => (
              <li key={feature}>
                <span className="check-icon" aria-hidden="true" />
                {feature}
              </li>
            ))}
          </ul>

          <Button type="button" variant="primary" fullWidth>
            {PLAN.cta}
          </Button>
        </div>
      </div>
    </div>
  );
}
