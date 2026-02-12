import React, { useEffect, useState } from "react";
import StatCard from "../components/StatCard.jsx";
import EmptyState from "../components/EmptyState.jsx";
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

function formatPlanLabel(plan) {
  const value = String(plan || "").toLowerCase();
  if (value === "active" || value === "paid") return "Pro";
  if (value === "trial") return "Trial";
  if (value === "inactive") return "Inactive";
  return "Unknown";
}

export default function Dashboard() {
  const { overview, loading: accessLoading, error: accessError, locked } = useAccess();
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
    plan: "inactive",
    trialDaysLeft: 0,
    last7DaysRevenue: 0,
    trial: { active: false }
  };
  const isEmptyStore = Number(safeOverview.totalOrders || 0) === 0;
  const normalizedPlan = formatPlanLabel(safeOverview.plan);
  const chartBars = [0.28, 0.42, 0.36, 0.55, 0.64, 0.58, 0.74];

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

      <div className="summary-grid">
        <StatCard label="Total Revenue" value={formatMoney(safeOverview.totalRevenue)} />
        <StatCard label="Orders" value={safeOverview.totalOrders} />
        <StatCard
          label="Active Plan"
          value={normalizedPlan}
          helper={safeOverview.plan === "trial" ? `${Number(safeOverview.trialDaysLeft || 0)} days left` : "All features included"}
        />
      </div>

      <div className="section-divider" aria-hidden="true" />

      <section className="card dashboard-section">
        <div className="section-heading">
          <h2>Performance</h2>
          <p className="page-subtitle">Visual snapshot of recent store momentum.</p>
        </div>
        <div className="charts-grid">
          <article className="chart-card">
            <h3>Revenue Trend (7 days)</h3>
            {isEmptyStore ? (
              <EmptyState
                title="No revenue trend yet"
                description="Once orders start syncing, this chart will show daily revenue movement."
              />
            ) : (
              <>
                <div className="chart-bars" aria-label="Revenue trend chart">
                  {chartBars.map((ratio, index) => (
                    <span
                      key={`revenue-bar-${index + 1}`}
                      className="chart-bar"
                      style={{ height: `${Math.round(ratio * 100)}%` }}
                    />
                  ))}
                </div>
                <p className="chart-caption">Last 7 days revenue: {formatMoney(safeOverview.last7DaysRevenue)}</p>
              </>
            )}
          </article>
          <article className="chart-card">
            <h3>Order Momentum</h3>
            {isEmptyStore ? (
              <EmptyState
                title="No order momentum yet"
                description="Create your first order in Shopify to start tracking momentum."
              />
            ) : (
              <div className="momentum-stack">
                <p className="momentum-value">{safeOverview.totalOrders}</p>
                <p className="chart-caption">Total orders synced and ready for analytics.</p>
              </div>
            )}
          </article>
        </div>
      </section>

      <div className="section-divider" aria-hidden="true" />

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
          <EmptyState
            title="We'll show insights once your first order arrives"
            description="Create a test order in Shopify to verify sync and unlock your dashboard metrics."
          />
        </section>
      ) : null}
    </div>
  );
}
