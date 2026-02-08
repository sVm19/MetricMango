import React, { useEffect, useState } from "react";
import StatCard from "../components/StatCard.jsx";
import { getPricing } from "../api.js";
import { useAccess } from "../access/AccessContext.jsx";

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function formatPrice(currency, amount) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amount || 0);
}

export default function Dashboard() {
  const { overview, loading: accessLoading, error: accessError } = useAccess();
  const [pricing, setPricing] = useState(null);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingError, setPricingError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setPricingLoading(true);
        setPricingError("");
        const pricingData = await getPricing();
        if (!active) return;
        setPricing(pricingData);
      } catch (error) {
        if (active) setPricingError("Pricing unavailable");
      } finally {
        if (active) setPricingLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  if (accessLoading) return <div className="empty">Loading overview...</div>;
  if (accessError && !locked) return <div className="empty">{accessError}</div>;

  const safeOverview = overview || {
    totalRevenue: 0,
    totalOrders: 0,
    last7DaysRevenue: 0,
    trial: { active: false }
  };
  const isEmptyStore = Number(safeOverview.totalOrders || 0) === 0;

  return (
    <div className="page">
      {safeOverview.trial?.active ? (
        <div className="trial-banner" role="status" aria-live="polite">
          One plan. All features. {pricing ? `7 days free. Then ${formatPrice(pricing.currency, pricing.amount)}/month.` : "7 days free."}
        </div>
      ) : null}
      <div className="page-header">
        <div>
          <h2>Dashboard Overview</h2>
          <p className="page-subtitle">Key sales totals at a glance.</p>
        </div>
      </div>
      <div className="stats-grid">
        <StatCard label="Total Revenue" value={formatMoney(safeOverview.totalRevenue)} />
        <StatCard label="Total Orders" value={safeOverview.totalOrders} />
        <StatCard label="Last 7 Days Revenue" value={formatMoney(safeOverview.last7DaysRevenue)} />
      </div>
      <section className="card">
        <h2>Pricing</h2>
        {pricing ? (
          <div className="pricing-row">
            <div>
              <div className="stat-label">One Plan</div>
              <div className="pricing-amount">
                {formatPrice(pricing.currency, pricing.amount)} / {pricing.interval}
              </div>
            </div>
            <div className="pricing-notes">
              <div>No tiers. No upsells.</div>
              <div>7 days free. Then {formatPrice(pricing.currency, pricing.amount)}/month.</div>
            </div>
          </div>
        ) : (
          <div className="empty">{pricingLoading ? "Loading pricing..." : pricingError || "Pricing unavailable"}</div>
        )}
      </section>
      {isEmptyStore ? (
        <section className="card empty-state-card">
          <h2>Getting Started</h2>
          <p className="empty-state-title">We&apos;ll show insights once your first order arrives</p>
          <p className="empty-state-body">
            Create a test order in Shopify to verify sync and unlock your dashboard metrics.
          </p>
        </section>
      ) : null}
    </div>
  );
}
