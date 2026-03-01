import React, { useEffect, useState } from "react";
import EmptyState from "../components/EmptyState.jsx";
import Button from "../components/Button.jsx";
import { useNavigate } from "react-router-dom";
import { getOrderMomentum, getPricing, getProducts, getRestockSuggestions } from "../api.js";
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

function formatMoneyByCurrency(currency, amount) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 0
  }).format(amount || 0);
}

function formatPercent(value) {
  const numeric = Number(value || 0);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(1)}%`;
}

function formatPlainNumber(value) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function getTrendPercent(currentValue, previousValue) {
  const current = Number(currentValue || 0);
  const previous = Number(previousValue || 0);
  if (previous <= 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function formatDaysLeft(value) {
  if (!Number.isFinite(Number(value))) return "No sales velocity";
  const days = Math.max(0, Math.ceil(Number(value)));
  return `~${days} days left`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { overview, loading: accessLoading, error: accessError, locked } = useAccess();
  const [pricing, setPricing] = useState(null);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingError, setPricingError] = useState("");
  const [impact, setImpact] = useState({
    atRiskSkus: 0,
    unitsShort: 0,
    revenueAtRisk: 0
  });
  const [syncedProductCount, setSyncedProductCount] = useState(0);
  const [impactLoading, setImpactLoading] = useState(true);
  const [impactError, setImpactError] = useState("");
  const [stockoutRisks, setStockoutRisks] = useState([]);
  const [momentum, setMomentum] = useState(null);
  const [momentumWindow, setMomentumWindow] = useState(7);
  const [revenueWindow, setRevenueWindow] = useState(7);
  const [momentumLoading, setMomentumLoading] = useState(true);
  const [momentumError, setMomentumError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setPricingLoading(true);
        setPricingError("");
        const pricingData = await getPricing();
        if (!active) return;
        setPricing(pricingData);
      } catch {
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

  useEffect(() => {
    let active = true;
    async function loadImpact() {
      if (locked) {
        if (!active) return;
        setImpact({ atRiskSkus: 0, unitsShort: 0, revenueAtRisk: 0 });
        setSyncedProductCount(0);
        setStockoutRisks([]);
        setImpactError("");
        setImpactLoading(false);
        return;
      }

      try {
        setImpactLoading(true);
        setImpactError("");
        const [restockData, productData] = await Promise.all([
          getRestockSuggestions(),
          getProducts()
        ]);
        if (!active) return;
        setSyncedProductCount(Array.isArray(productData?.products) ? productData.products.length : 0);

        const productByProductId = new Map(
          (productData?.products || []).map(item => [
            String(item?.id || item?.productId || ""),
            {
              price: Number(item?.price || 0),
              name: String(item?.name || "").trim()
            }
          ])
        );
        let atRiskSkus = 0;
        let unitsShort = 0;
        let revenueAtRisk = 0;
        const nextStockoutRisks = [];

        for (const [index, item] of (restockData?.suggestions || []).entries()) {
          if (String(item?.suggestion || "").toUpperCase() !== "RESTOCK") continue;
          atRiskSkus += 1;
          const productId = String(item?.productId || item?.id || "");
          const productMeta = productByProductId.get(productId) || {};
          const shortUnits = Math.max(0, Number(item?.expectedDemand || 0) - Number(item?.currentStock || 0));
          unitsShort += shortUnits;
          const price = Number(productMeta?.price || 0);
          revenueAtRisk += shortUnits * price;

          const avgDailySales = Math.max(0, Number(item?.avgDailySales || 0));
          const currentStock = Math.max(0, Number(item?.currentStock || 0));
          const daysLeft = avgDailySales > 0 ? currentStock / avgDailySales : Number.POSITIVE_INFINITY;
          const fallbackName = productId ? `SKU ${productId}` : `SKU ${index + 1}`;
          nextStockoutRisks.push({
            productId: productId || `risk-${index + 1}`,
            skuName: String(productMeta?.name || item?.name || fallbackName),
            daysLeft
          });
        }

        nextStockoutRisks.sort((first, second) => Number(first.daysLeft || 0) - Number(second.daysLeft || 0));

        setImpact({
          atRiskSkus,
          unitsShort: Math.round(unitsShort),
          revenueAtRisk
        });
        setStockoutRisks(nextStockoutRisks);
      } catch {
        if (!active) return;
        setImpact({ atRiskSkus: 0, unitsShort: 0, revenueAtRisk: 0 });
        setSyncedProductCount(0);
        setStockoutRisks([]);
        setImpactError("Impact unavailable");
      } finally {
        if (active) setImpactLoading(false);
      }
    }
    loadImpact();
    return () => {
      active = false;
    };
  }, [locked]);

  useEffect(() => {
    let active = true;
    async function loadMomentum() {
      if (locked) {
        if (!active) return;
        setMomentum(null);
        setMomentumError("");
        setMomentumLoading(false);
        return;
      }

      try {
        setMomentumLoading(true);
        setMomentumError("");
        const response = await getOrderMomentum();
        if (!active) return;
        const defaultWindow = Number(response?.defaultWindowDays || 7);
        setMomentum(response || null);
        setMomentumWindow([7, 14, 30].includes(defaultWindow) ? defaultWindow : 7);
        setRevenueWindow([7, 14, 30].includes(defaultWindow) ? defaultWindow : 7);
      } catch {
        if (!active) return;
        setMomentum(null);
        setMomentumError("Momentum unavailable");
      } finally {
        if (active) setMomentumLoading(false);
      }
    }

    loadMomentum();
    return () => {
      active = false;
    };
  }, [locked]);

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
  const impactCurrency = pricing?.currency || "INR";
  const skuRiskLevel = impact.atRiskSkus >= 3 ? "high" : impact.atRiskSkus >= 1 ? "medium" : "low";
  const unitsRiskLevel = impact.unitsShort >= 25 ? "high" : impact.unitsShort >= 8 ? "medium" : "low";
  const revenueRiskLevel = impact.revenueAtRisk >= 30000 ? "high" : impact.revenueAtRisk >= 8000 ? "medium" : "low";
  const momentumWindows = momentum?.windows || {};
  const selectedMomentum = momentumWindows[momentumWindow] || null;
  const selectedRevenueMomentum = momentumWindows[revenueWindow] || null;
  const momentumTrend = Number(selectedMomentum?.trendPercent || 0);
  const momentumStatus = String(selectedMomentum?.status || "stable");
  const momentumSeries = Array.isArray(selectedMomentum?.currentSeries) ? selectedMomentum.currentSeries : [];
  const maxSeriesValue = Math.max(1, ...momentumSeries);
  const momentumInsight = momentumStatus === "growing"
    ? `Orders are up ${formatPercent(momentumTrend)} vs previous ${momentumWindow} days. Keep top sellers in stock.`
    : momentumStatus === "slowing"
      ? `Orders are down ${formatPercent(momentumTrend)} vs previous ${momentumWindow} days. Push replenishment and promos on core SKUs.`
      : `Orders are stable (${formatPercent(momentumTrend)}) vs previous ${momentumWindow} days. Maintain current inventory pace.`;
  const momentumAction = impact.atRiskSkus > 0
    ? `Action now: restock ${impact.atRiskSkus} at-risk SKU${impact.atRiskSkus > 1 ? "s" : ""}.`
    : "Action now: no critical restock risks detected.";
  const last7Orders = Number(momentumWindows?.[7]?.current?.orders || 0);
  const ordersTrend7 = Number(momentumWindows?.[7]?.trendPercent || 0);
  const totalRevenue = Number(safeOverview.totalRevenue || 0);
  const totalOrders = Number(safeOverview.totalOrders || 0);
  const avgRevenuePerOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const ordersTrendTone = ordersTrend7 >= 0 ? "positive" : "negative";
  const revenueSeries = Array.isArray(selectedRevenueMomentum?.currentRevenueSeries)
    ? selectedRevenueMomentum.currentRevenueSeries
    : [];
  const maxRevenueValue = Math.max(1, ...revenueSeries);
  const revenueTotal = Number(
    selectedRevenueMomentum?.current?.revenue
    || (revenueWindow === 7 ? safeOverview.last7DaysRevenue : 0)
  );
  const previousRevenueTotal = Number(selectedRevenueMomentum?.previous?.revenue || 0);
  const revenueTrendPercent = getTrendPercent(revenueTotal, previousRevenueTotal);
  const averageRevenuePerDay = revenueWindow > 0 ? revenueTotal / revenueWindow : 0;
  const peakRevenueDayValue = revenueSeries.length ? Math.max(...revenueSeries) : 0;
  const peakRevenueDayIndex = revenueSeries.findIndex(value => value === peakRevenueDayValue) + 1;
  const topStockoutRisks = stockoutRisks.slice(0, 3);
  const showFirstTimeWelcome = !locked
    && !impactLoading
    && !impactError
    && totalOrders <= 0
    && totalRevenue <= 0
    && syncedProductCount <= 0;

  return (
    <div className="page dashboard-page">
      {safeOverview.trial?.active ? (
        <div className="trial-banner" role="status" aria-live="polite">
          One plan. All features. {pricing ? `7 days free. Then ${formatPrice(pricing.currency, pricing.amount)}/month.` : "7 days free."}
        </div>
      ) : null}
      <div className="page-header">
        <div>
          <h2>Dashboard Overview</h2>
          <p className="page-subtitle">Everything that matters, in one view.</p>
        </div>
      </div>

      {showFirstTimeWelcome ? (
        <section className="card welcome-banner-card">
          <div className="welcome-banner-main">
            <div className="stat-label">Getting Started</div>
            <h3 className="welcome-banner-title">Welcome to Metric Mango</h3>
            <p className="welcome-banner-subline">
              Setup complete. Your first insights will appear within 24 hours of your store&apos;s next sale.
            </p>
            <div className="welcome-milestones" role="status" aria-label="Getting started progress">
              <span className="welcome-milestone welcome-milestone-done">&#10003; Store connected</span>
              <span className="welcome-milestone welcome-milestone-awaiting">&#9203; Awaiting first sale</span>
              <span className="welcome-milestone welcome-milestone-inactive">&#9675; Forecast ready</span>
            </div>
          </div>
          <div className="welcome-banner-actions">
            <button type="button" className="welcome-guide-cta" onClick={() => navigate("/dashboard/onboarding")}>
              View Setup Guide &rarr;
            </button>
          </div>
        </section>
      ) : (
        <div className="summary-grid">
          <article className="stat-card summary-insight-card">
            <div className="summary-card-head">
              <div className="stat-label">Total Revenue</div>
              <span className="summary-badge">Store Lifetime</span>
            </div>
            {totalRevenue === 0 ? (
              <div className="card-empty-state">
                <div className="empty-state-icon">₹</div>
                <div className="empty-state-headline">No revenue data yet</div>
                <div className="empty-state-subline">Lifetime store performance at a glance.</div>
              </div>
            ) : (
              <>
                <div className="stat-value">{formatMoney(totalRevenue)}</div>
                <div className="summary-meta-grid">
                  <div className="summary-meta-item">
                    <span className="stat-label">Last 7d</span>
                    <strong>{formatMoney(safeOverview.last7DaysRevenue)}</strong>
                  </div>
                  <div className="summary-meta-item">
                    <span className="stat-label">Avg / order</span>
                    <strong>{formatMoney(avgRevenuePerOrder)}</strong>
                  </div>
                </div>
              </>
            )}
          </article>

          <article className="stat-card summary-insight-card">
            <div className="summary-card-head">
              <div className="stat-label">Orders</div>
              <span className={`summary-badge summary-badge-${ordersTrendTone}`}>{formatPercent(ordersTrend7)} (7d)</span>
            </div>
            {totalOrders === 0 ? (
              <div className="card-empty-state">
                <div className="empty-state-icon">📦</div>
                <div className="empty-state-headline">No orders yet</div>
                <div className="empty-state-subline">Demand in motion — tracked daily.</div>
              </div>
            ) : (
              <>
                <div className="stat-value">{formatPlainNumber(totalOrders)}</div>
                <div className="summary-meta-grid">
                  <div className="summary-meta-item">
                    <span className="stat-label">Last 7d</span>
                    <strong>{formatPlainNumber(last7Orders)}</strong>
                  </div>
                  <div className="summary-meta-item">
                    <span className="stat-label">Status</span>
                    <strong>{ordersTrend7 >= 10 ? "Growing" : ordersTrend7 <= -10 ? "Slowing" : "Stable"}</strong>
                  </div>
                </div>
              </>
            )}
          </article>

          <article className="stat-card summary-insight-card">
            <div className="summary-card-head">
              <div className="stat-label">Stockout Risk</div>
              <span className="summary-badge">{formatPlainNumber(impact.atRiskSkus)} Critical</span>
            </div>
            {impact.atRiskSkus === 0 ? (
              <div className="card-empty-state">
                <div className="empty-state-icon empty-state-icon-success">✓</div>
                <div className="empty-state-headline">All clear — no SKUs at risk</div>
                <div className="empty-state-subline">Your early warning system for stockouts.</div>
              </div>
            ) : (
              <>
                <div className="stat-value">{formatPlainNumber(impact.atRiskSkus)}</div>
                <div className="stockout-risk-list">
                  {topStockoutRisks.map(risk => (
                    <div key={risk.productId} className="summary-meta-item stockout-risk-item">
                      <div className="stockout-risk-main">
                        <span
                          className={`stockout-risk-dot ${Number(risk.daysLeft || 0) <= 3 ? "stockout-risk-critical" : "stockout-risk-warning"}`}
                          aria-hidden="true"
                        />
                        <span className="stockout-risk-name" title={risk.skuName}>{risk.skuName}</span>
                      </div>
                      <span className="stockout-risk-days">{formatDaysLeft(risk.daysLeft)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {impact.atRiskSkus > 0 ? (
              <button type="button" className="stockout-risk-cta" onClick={() => navigate("/dashboard/products")}>
                View All At-Risk SKUs &rarr;
              </button>
            ) : null}
          </article>
        </div>
      )}

      <div className="section-divider" aria-hidden="true" />

      <section className="card dashboard-section">
        <div className="section-heading">
          <h2>Impact</h2>
          <p className="page-subtitle">Estimated risk from current restock signals.</p>
        </div>
        {impactLoading ? (
          <EmptyState
            title="Loading impact..."
            description="Calculating stockout risk and potential revenue exposure."
          />
        ) : null}
        {!impactLoading && impactError ? (
          <EmptyState
            title="Impact unavailable"
            description={impactError}
          />
        ) : null}
        {!impactLoading && !impactError ? (
          <div className="impact-grid">
            <article className={`stat-card impact-card impact-${skuRiskLevel}`}>
              <div className="stat-label">SKUs At Risk</div>
              <div className="stat-value">{impact.atRiskSkus}</div>
              <div className="stat-helper">
                {impact.atRiskSkus > 0 ? "Products currently marked RESTOCK." : "No immediate stockout risk detected."}
              </div>
            </article>
            <article className={`stat-card impact-card impact-${unitsRiskLevel}`}>
              <div className="stat-label">Estimated Units Short</div>
              <div className="stat-value">{impact.unitsShort}</div>
              <div className="stat-helper">Demand gap over next lead-time window.</div>
            </article>
            <article className={`stat-card impact-card impact-${revenueRiskLevel}`}>
              <div className="stat-label">Revenue At Risk</div>
              <div className="stat-value">{formatMoneyByCurrency(impactCurrency, impact.revenueAtRisk)}</div>
              <div className="stat-helper">Estimated from units short x product price.</div>
            </article>
          </div>
        ) : null}
      </section>

      <div className="section-divider" aria-hidden="true" />

      <section className="card dashboard-section dashboard-performance">
        <div className="section-heading">
          <h2>Performance</h2>
          <p className="page-subtitle">Visual snapshot of recent store momentum.</p>
        </div>
        <div className="charts-grid">
          <article className="chart-card">
            <h3>Revenue Trend</h3>
            {isEmptyStore ? (
              <EmptyState
                title="No revenue trend yet"
                description="Once orders start syncing, this chart will show daily revenue movement."
              />
            ) : momentumLoading ? (
              <EmptyState
                title="Loading revenue trend..."
                description="Preparing period comparisons and daily revenue bars."
              />
            ) : momentumError || !selectedRevenueMomentum ? (
              <EmptyState
                title="Revenue trend unavailable"
                description={momentumError || "Please retry in a moment."}
              />
            ) : (
              <>
                <div className="chart-toolbar">
                  <div className="momentum-filters">
                    {[7, 14, 30].map(days => (
                      <button
                        key={`revenue-filter-${days}`}
                        type="button"
                        className={`momentum-filter-btn ${revenueWindow === days ? "active" : ""}`}
                        onClick={() => setRevenueWindow(days)}
                      >
                        {days}d
                      </button>
                    ))}
                  </div>
                  <div className={`momentum-delta ${revenueTrendPercent >= 0 ? "positive" : "negative"}`}>
                    {formatPercent(revenueTrendPercent)} vs previous {revenueWindow}d
                  </div>
                </div>
                <div className="chart-bars" aria-label="Revenue trend chart">
                  {revenueSeries.map((value, index) => (
                    <span
                      key={`revenue-bar-${revenueWindow}-${index + 1}`}
                      className="chart-bar"
                      title={`Day ${index + 1}: ${formatMoneyByCurrency(impactCurrency, value)}`}
                      style={{ height: `${Math.max(8, Math.round((Number(value || 0) / maxRevenueValue) * 100))}%` }}
                    />
                  ))}
                </div>
                <div className="chart-stats-row">
                  <div className="chart-stat-pill">
                    <span>Total</span>
                    <strong>{formatMoneyByCurrency(impactCurrency, revenueTotal)}</strong>
                  </div>
                  <div className="chart-stat-pill">
                    <span>Avg / day</span>
                    <strong>{formatMoneyByCurrency(impactCurrency, averageRevenuePerDay)}</strong>
                  </div>
                  <div className="chart-stat-pill">
                    <span>Peak day</span>
                    <strong>
                      {peakRevenueDayIndex > 0
                        ? `Day ${peakRevenueDayIndex} (${formatMoneyByCurrency(impactCurrency, peakRevenueDayValue)})`
                        : "Not enough data"}
                    </strong>
                  </div>
                </div>
                <p className="chart-caption">
                  {revenueWindow}d revenue: {formatMoneyByCurrency(impactCurrency, revenueTotal)}.
                  {" "}Previous {revenueWindow}d: {formatMoneyByCurrency(impactCurrency, previousRevenueTotal)}.
                </p>
              </>
            )}
          </article>
          <article className="chart-card">
            <h3>Order Momentum</h3>
            {isEmptyStore ? (
              <div className="momentum-empty-wrap">
                <EmptyState
                  title="No order momentum yet"
                  description="Create your first order in Shopify to start tracking momentum."
                />
                <Button type="button" variant="secondary" onClick={() => navigate("/dashboard/onboarding")}>
                  Sync Shopify Now
                </Button>
              </div>
            ) : momentumLoading ? (
              <EmptyState
                title="Loading momentum..."
                description="Calculating trend, baseline, and action signals."
              />
            ) : momentumError || !selectedMomentum ? (
              <EmptyState
                title="Momentum unavailable"
                description={momentumError || "Please retry in a moment."}
              />
            ) : (
              <article
                className={`momentum-stack momentum-clickable momentum-${momentumStatus}`}
                role="button"
                tabIndex={0}
                aria-label="Open forecast details"
                onClick={() => navigate("/dashboard/forecast")}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate("/dashboard/forecast");
                  }
                }}
              >
                <div className="momentum-toolbar" onClick={event => event.stopPropagation()}>
                  <div className={`momentum-status momentum-status-${momentumStatus}`}>
                    {momentumStatus === "growing" ? "Growing" : momentumStatus === "slowing" ? "Slowing" : "Stable"}
                  </div>
                  <div className="momentum-filters">
                    {[7, 14, 30].map(days => (
                      <button
                        key={`momentum-filter-${days}`}
                        type="button"
                        className={`momentum-filter-btn ${momentumWindow === days ? "active" : ""}`}
                        onClick={() => setMomentumWindow(days)}
                      >
                        {days}d
                      </button>
                    ))}
                  </div>
                </div>

                <div className="momentum-main">
                  <p className="momentum-value">{selectedMomentum.current?.orders || 0}</p>
                  <p className={`momentum-delta ${momentumTrend >= 0 ? "positive" : "negative"}`}>
                    {formatPercent(momentumTrend)} vs previous {momentumWindow}d
                  </p>
                </div>

                <div className="momentum-compare">
                  <div className="momentum-compare-item">
                    <span className="stat-label">This {momentumWindow}d</span>
                    <strong>{selectedMomentum.current?.orders || 0} orders</strong>
                  </div>
                  <div className="momentum-compare-item">
                    <span className="stat-label">Previous {momentumWindow}d</span>
                    <strong>{selectedMomentum.previous?.orders || 0} orders</strong>
                  </div>
                </div>

                <div className="momentum-quality">
                  <div>
                    <span className="stat-label">Avg Order Value</span>
                    <strong>{formatMoneyByCurrency(impactCurrency, selectedMomentum.current?.avgOrderValue || 0)}</strong>
                  </div>
                  <div>
                    <span className="stat-label">Repeat Order %</span>
                    <strong>
                      {selectedMomentum.current?.repeatOrderRate === null
                        ? "Need customer data"
                        : `${Number(selectedMomentum.current?.repeatOrderRate || 0).toFixed(1)}%`}
                    </strong>
                  </div>
                </div>

                <div className="momentum-sparkline" aria-label={`Order sparkline for ${momentumWindow} days`}>
                  {momentumSeries.map((value, index) => (
                    <span
                      key={`momentum-bar-${index + 1}`}
                      className="momentum-sparkline-bar"
                      style={{ height: `${Math.max(12, Math.round((value / maxSeriesValue) * 100))}%` }}
                    />
                  ))}
                </div>

                <p className="chart-caption">{momentumInsight}</p>
                <p className="chart-caption">{momentumAction}</p>
                <p className="chart-caption">Click this card to open Forecast details.</p>
              </article>
            )}
          </article>
        </div>
      </section>

      <div className="section-divider" aria-hidden="true" />

      <section className="card dashboard-section">
        <h2>Pricing</h2>
        {pricing ? (
          <div className="pricing-row">
            <div>
              <div className="stat-label">One Plan</div>
              <div className="pricing-amount">
                {formatPrice(pricing.currency, pricing.amount)} / {pricing.interval}
              </div>
              <div className="stat-helper">Everything included in one subscription.</div>
            </div>
            <div className="pricing-notes">
              <div>No tiers. No upsells.</div>
              <div>7 days free. Then {formatPrice(pricing.currency, pricing.amount)}/month.</div>
              <div>Forecasting • Restock Signals • CSV Exports • Email Alerts</div>
            </div>
          </div>
        ) : (
          <EmptyState
            title={pricingLoading ? "Loading pricing..." : "Pricing unavailable"}
            description={pricingLoading ? "Fetching the latest plan details for your store." : pricingError || "Please retry in a moment."}
          />
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
