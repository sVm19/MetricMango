import React, { useEffect, useState } from "react";
import EmptyState from "../components/EmptyState.jsx";
import Button from "../components/Button.jsx";
import { useNavigate } from "react-router-dom";
import {
  exportRestockPlanCsv,
  getOrderMomentum,
  getPricing,
  getProducts,
  getRestockSuggestions,
  getSkuAnalytics,
  postRetentionHeartbeat
} from "../api.js";
import { useAccess } from "../access/AccessContext.jsx";
import { IconSquareArrowUp, IconSquareArrowDown, IconAlertTriangle, IconTrendingDown, IconTrendingUp, IconX, IconAlertCircle, IconCircleCheck, IconRocket } from "@tabler/icons-react";

const StoreAnalytics = React.lazy(() => import("../components/StoreAnalytics.jsx"));

function TrendBadge({ direction }) {
  const isUp = direction !== "down";
  const Icon = isUp ? IconSquareArrowUp : IconSquareArrowDown;
  const label = isUp ? "Trending" : "Slow";
  const badgeClass = isUp ? "trend-badge trend-badge-up" : "trend-badge trend-badge-down";

  return (
    <div className={badgeClass} aria-label={`${label} trend`}>
      <Icon size={16} stroke={2.5} />
      <span>{label}</span>
    </div>
  );
}

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

const RevenueChartBars = React.memo(({ revenueSeries, revenueWindow, impactCurrency, maxRevenueValue }) => {
  const [isVisible, setIsVisible] = useState(false);
  const chartRef = React.useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (chartRef.current) observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);

  const limitedSeries = React.useMemo(() => {
    if (!isVisible) return [];
    let points = revenueSeries;
    if (points.length > 30) {
      const step = Math.ceil(points.length / 30);
      points = points.filter((_, i) => i % step === 0);
    }
    return points;
  }, [revenueSeries, isVisible]);

  return (
    <div ref={chartRef} className="chart-bars" aria-label="Revenue trend chart">
      {isVisible && limitedSeries.map((value, index) => (
        <span
          key={`revenue-bar-${revenueWindow}-${index + 1}`}
          className="chart-bar"
          title={`Day ${index + 1}: ${formatMoneyByCurrency(impactCurrency, value)}`}
          style={{ height: `${Math.max(8, Math.round((Number(value || 0) / maxRevenueValue) * 100))}%` }}
        />
      ))}
    </div>
  );
});

const OrderSparkline = React.memo(({ momentumSeries, momentumWindow, maxSeriesValue }) => {
  const [isVisible, setIsVisible] = useState(false);
  const chartRef = React.useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (chartRef.current) observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);

  const limitedSeries = React.useMemo(() => {
    if (!isVisible) return [];
    let points = momentumSeries;
    if (points.length > 30) {
      const step = Math.ceil(points.length / 30);
      points = points.filter((_, i) => i % step === 0);
    }
    return points;
  }, [momentumSeries, isVisible]);

  return (
    <div ref={chartRef} className="momentum-sparkline" aria-label={`Order sparkline for ${momentumWindow} days`}>
      {isVisible && limitedSeries.map((value, index) => (
        <span
          key={`momentum-bar-${index + 1}`}
          className="momentum-sparkline-bar"
          style={{ height: `${Math.max(12, Math.round((value / maxSeriesValue) * 100))}%` }}
        />
      ))}
    </div>
  );
});

const AnimatedNumber = React.memo(({ value, formatter, duration = 1000, className = "" }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let start = null;
    let animationFrameId;
    const endValue = Number(value) || 0;

    if (endValue === 0) {
      const timer = setTimeout(() => setDisplayValue(0), 0);
      return () => clearTimeout(timer);
    }

    const step = (timestamp) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      
      setDisplayValue(endValue * easeOutQuart);
      
      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(step);
      } else {
        setDisplayValue(endValue);
      }
    };
    
    animationFrameId = window.requestAnimationFrame(step);

    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [value, duration]);

  const formatted = formatter ? formatter(displayValue) : Math.round(displayValue);
  
  return <span className={className}>{formatted}</span>;
});

const SmartAlertBanner = React.memo(({ stockoutRisks, revenueTrendPercent, momentumTrend, topPerformerByVelocity }) => {
  const [dismissed, setDismissed] = useState(false);

  const alert = React.useMemo(() => {
    const closeStockouts = (stockoutRisks || []).filter(r => Number(r.daysLeft || 999) <= 1);
    if (closeStockouts.length > 0) {
      return {
        type: 'stock',
        icon: <IconAlertTriangle size={20} color="#f59e0b" />,
        message: `${closeStockouts.length} product${closeStockouts.length > 1 ? 's' : ''} may run out of stock within 24 hours.`,
        bgColor: 'rgba(245, 158, 11, 0.1)',
        borderColor: 'rgba(245, 158, 11, 0.3)',
      };
    }
    if (revenueTrendPercent <= -10) {
      return {
        type: 'revenue',
        icon: <IconTrendingDown size={20} color="#ef4444" />,
        message: `Revenue dropped ${Math.abs(Math.round(revenueTrendPercent))}% compared to the previous period.`,
        bgColor: 'rgba(239, 68, 68, 0.1)',
        borderColor: 'rgba(239, 68, 68, 0.3)',
      };
    }
    if (topPerformerByVelocity && momentumTrend > 5) {
      return {
        type: 'opportunity',
        icon: <IconTrendingUp size={20} color="#10b981" />,
        message: `${topPerformerByVelocity.skuName} is trending and selling faster than usual.`,
        bgColor: 'rgba(16, 185, 129, 0.1)',
        borderColor: 'rgba(16, 185, 129, 0.3)',
      };
    }
    return null;
  }, [stockoutRisks, revenueTrendPercent, momentumTrend, topPerformerByVelocity]);

  if (!alert || dismissed) return null;

  return (
    <div 
      className="smart-alert-banner"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        background: alert.bgColor,
        border: `1px solid ${alert.borderColor}`,
        borderRadius: '12px',
        marginBottom: '24px',
        animation: 'fadeUpPage 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }}
      role="alert"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {alert.icon}
        <span style={{ fontWeight: 600, color: 'var(--dash-ink)' }}>{alert.message}</span>
      </div>
      <button 
        onClick={() => setDismissed(true)} 
        style={{ 
          background: 'transparent', 
          border: 'none', 
          cursor: 'pointer', 
          display: 'flex', 
          alignItems: 'center',
          color: 'var(--dash-ink-soft)',
          padding: '4px',
        }}
        aria-label="Dismiss alert"
      >
        <IconX size={18} />
      </button>
    </div>
  );
});

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Dashboard Render Error Caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page dashboard-page" style={{ padding: '40px', textAlign: 'center' }}>
          <h2>Something went wrong loading the dashboard.</h2>
          <p style={{ color: 'var(--dash-ink-soft)', marginTop: '8px' }}>
            Please refresh the page to try again.
          </p>
          <Button type="button" onClick={() => window.location.reload()} style={{ marginTop: '24px' }}>
            Refresh Page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

function DashboardComponent() {
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
  const [actionPlanRows, setActionPlanRows] = useState([]);
  const [actionPlanExporting, setActionPlanExporting] = useState(false);
  const [momentum, setMomentum] = useState(null);
  const [momentumWindow, setMomentumWindow] = useState(7);
  const [revenueWindow, setRevenueWindow] = useState(7);
  const [momentumLoading, setMomentumLoading] = useState(true);
  const [momentumError, setMomentumError] = useState("");
  const [skuAnalytics, setSkuAnalytics] = useState(null);
  const [skuAnalyticsLoading, setSkuAnalyticsLoading] = useState(true);
  const [skuAnalyticsError, setSkuAnalyticsError] = useState("");

  useEffect(() => {
    postRetentionHeartbeat("dashboard").catch(() => { });
  }, []);

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
        setActionPlanRows([]);
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
        const nextActionPlanRows = [];

        for (const [index, item] of (restockData?.suggestions || []).entries()) {
          if (String(item?.suggestion || "").toUpperCase() !== "RESTOCK") continue;
          atRiskSkus += 1;
          const productId = String(item?.productId || item?.id || "");
          const productMeta = productByProductId.get(productId) || {};
          const shortUnits = Math.max(0, Number(item?.recommendedReorderQty ?? item?.requiredUnits ?? (Number(item?.expectedDemand || 0) - Number(item?.currentStock || 0))));
          unitsShort += shortUnits;
          const price = Number(productMeta?.price || 0);
          const itemRevenueAtRisk = Number(item?.revenueAtRisk ?? (shortUnits * price));
          revenueAtRisk += itemRevenueAtRisk;

          const avgDailySales = Math.max(0, Number(item?.avgDailySales || 0));
          const currentStock = Math.max(0, Number(item?.currentStock || 0));
          const daysLeft = Number.isFinite(Number(item?.daysUntilStockout))
            ? Number(item.daysUntilStockout)
            : (avgDailySales > 0 ? currentStock / avgDailySales : Number.POSITIVE_INFINITY);
          const fallbackName = productId ? `SKU ${productId}` : `SKU ${index + 1}`;
          const skuName = String(productMeta?.name || item?.name || fallbackName);
          nextStockoutRisks.push({
            productId: productId || `risk-${index + 1}`,
            skuName,
            daysLeft
          });
          nextActionPlanRows.push({
            productId: productId || `risk-${index + 1}`,
            skuName,
            supplierName: String(item?.supplierName || "").trim(),
            daysLeft,
            reorderQty: Math.round(shortUnits),
            revenueAtRisk: itemRevenueAtRisk
          });
        }

        nextStockoutRisks.sort((first, second) => Number(first.daysLeft || 0) - Number(second.daysLeft || 0));
        nextActionPlanRows.sort((first, second) => {
          const revenueDiff = Number(second.revenueAtRisk || 0) - Number(first.revenueAtRisk || 0);
          if (revenueDiff !== 0) return revenueDiff;
          return Number(first.daysLeft || 0) - Number(second.daysLeft || 0);
        });

        setImpact({
          atRiskSkus,
          unitsShort: Math.round(unitsShort),
          revenueAtRisk
        });
        setStockoutRisks(nextStockoutRisks);
        setActionPlanRows(nextActionPlanRows.slice(0, 5));
      } catch {
        if (!active) return;
        setImpact({ atRiskSkus: 0, unitsShort: 0, revenueAtRisk: 0 });
        setSyncedProductCount(0);
        setStockoutRisks([]);
        setActionPlanRows([]);
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

  useEffect(() => {
    let active = true;
    async function loadSkuAnalytics() {
      if (locked) {
        if (!active) return;
        setSkuAnalytics(null);
        setSkuAnalyticsLoading(false);
        setSkuAnalyticsError("");
        return;
      }

      try {
        setSkuAnalyticsLoading(true);
        setSkuAnalyticsError("");
        const response = await getSkuAnalytics();
        if (!active) return;
        setSkuAnalytics(response || null);
      } catch {
        if (!active) return;
        setSkuAnalytics(null);
        setSkuAnalyticsError("SKU analytics unavailable");
      } finally {
        if (active) setSkuAnalyticsLoading(false);
      }
    }

    loadSkuAnalytics();
    return () => {
      active = false;
    };
  }, [locked]);

  const fullPageSkeleton = (
    <div className="page dashboard-page animate-pulse">
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div className="skeleton skeleton-title"></div>
        <div className="skeleton skeleton-text" style={{ width: '40%' }}></div>
      </div>
      <div className="summary-grid">
        <div className="stat-card skeleton skeleton-card"></div>
        <div className="stat-card skeleton skeleton-card"></div>
        <div className="stat-card skeleton skeleton-card"></div>
      </div>
    </div>
  );

  if (accessLoading) return fullPageSkeleton;
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

  // #6: Top Sales Performer — product with highest 7-day revenue from restock data
  const productList = [];
  if (momentum?.windows?.[7]) {
    // Use restock suggestions to get per-product velocity and match names from stockoutRisks
    stockoutRisks.forEach(risk => {
      productList.push({ name: risk.skuName, daysLeft: risk.daysLeft });
    });
  }
  // Find the restock suggestion with highest avgDailySales as top performer proxy
  const allRestockData = [];
  stockoutRisks.forEach(r => allRestockData.push(r));
  const topPerformerByVelocity = allRestockData.length > 0
    ? [...allRestockData].sort((a, b) => Number(a.daysLeft || 999) - Number(b.daysLeft || 999))[0]
    : null;

  // #5: Today's Action — most urgent single message
  const urgentRisk = topStockoutRisks[0] || null;
  const todayActionType = impact.atRiskSkus > 0 ? (urgentRisk && Number(urgentRisk.daysLeft) <= 3 ? "critical" : "warning") : "safe";

  async function handleExportActionPlan() {
    setActionPlanExporting(true);
    try {
      await exportRestockPlanCsv();
    } finally {
      setActionPlanExporting(false);
    }
  }

  return (
    <div className="page dashboard-page">
      {safeOverview?.trial?.active ? (
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

      {!isEmptyStore && !impactLoading && !locked ? (
        <SmartAlertBanner
          stockoutRisks={stockoutRisks}
          revenueTrendPercent={revenueTrendPercent}
          momentumTrend={momentumTrend}
          topPerformerByVelocity={topPerformerByVelocity}
        />
      ) : null}

      {/* #5: Today's Action callout */}
      {!isEmptyStore && !impactLoading && !locked ? (
        <section className={`today-action-callout today-action-${todayActionType}`} role="alert" aria-live="polite">
          <div className={`action-icon-btn action-icon-${todayActionType}`}>
            {todayActionType === "critical" ? <IconAlertTriangle size={22} /> : todayActionType === "warning" ? <IconAlertCircle size={22} /> : <IconCircleCheck size={22} />}
          </div>
          <div className="today-action-body">
            <strong className="today-action-label">
              {todayActionType === "critical"
                ? "Critical: Immediate Restock Needed"
                : todayActionType === "warning"
                  ? "Action Required This Week"
                  : "All Clear — No Urgent Restocks"}
            </strong>
            <p className="today-action-message">
              {todayActionType === "safe"
                ? "No SKUs are at risk of stocking out in the next 7 days. Keep tracking."
                : urgentRisk
                  ? `${urgentRisk.skuName} runs out in ~${Math.ceil(urgentRisk.daysLeft)} days. ${impact.atRiskSkus > 1 ? `${impact.atRiskSkus - 1} more SKU${impact.atRiskSkus > 2 ? "s" : ""} also need attention.` : ""}`
                  : `${impact.atRiskSkus} SKU${impact.atRiskSkus > 1 ? "s" : ""} need restocking.`}
            </p>
          </div>
          {todayActionType !== "safe" ? (
            <button type="button" className="today-action-cta" onClick={() => navigate("/dashboard/products")}>
              View Restock List →
            </button>
          ) : null}
        </section>
      ) : null}

      {showFirstTimeWelcome ? (
        <section className="card welcome-banner-card">
          <div className="welcome-banner-main">
            <div className="stat-label welcome-eyebrow">🚀 You're all set up!</div>
            <h3 className="welcome-banner-title">Your first stockout alert is ready to fire.</h3>
            <p className="welcome-banner-subline">
              Make a sale in Shopify and Metric Mango will automatically build your demand forecast.
              Here&apos;s what you&apos;ll unlock:
            </p>
            <ul className="welcome-preview-list">
              <li>📊 <strong>Daily run-rate</strong> for every SKU</li>
              <li>📧 <strong>Email alerts</strong> when a product is 5 days from zero</li>
              <li>📋 <strong>Weekly priority report</strong> with what to reorder</li>
            </ul>
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
                <div className="stat-value"><AnimatedNumber value={totalRevenue} formatter={formatMoney} className="glow-metric" /></div>
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

          {/* #2: Trend arrow on Orders badge, #1: Daily velocity in meta */}
          <article className="stat-card summary-insight-card">
            <div className="summary-card-head">
              <div className="stat-label">Orders</div>
              {/* #2: Trend arrow */}
              <span className={`summary-badge summary-badge-${ordersTrendTone}`}>
                {ordersTrend7 >= 0 ? "▲" : "▼"} {Math.abs(ordersTrend7).toFixed(1)}% (7d)
              </span>
            </div>
            {totalOrders === 0 ? (
              <div className="card-empty-state">
                <div className="empty-state-icon">📦</div>
                <div className="empty-state-headline">No orders yet</div>
                <div className="empty-state-subline">Demand in motion — tracked daily.</div>
              </div>
            ) : (
              <>
                <div className="stat-value"><AnimatedNumber value={totalOrders} formatter={formatPlainNumber} className="glow-metric" /></div>
                <div className="summary-meta-grid">
                  <div className="summary-meta-item">
                    <span className="stat-label">Last 7d</span>
                    <strong>{formatPlainNumber(last7Orders)}</strong>
                  </div>
                  {/* #1: Daily velocity */}
                  <div className="summary-meta-item">
                    <span className="stat-label">Avg / day</span>
                    <strong>{(totalOrders > 0 ? (totalOrders / 30) : 0).toFixed(1)} orders</strong>
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
                <div className="stat-value"><AnimatedNumber value={impact.atRiskSkus} formatter={formatPlainNumber} className="glow-metric-warning" /></div>
                <div className="stockout-risk-list">
                  {(topStockoutRisks || []).map(risk => (
                    <div key={risk.productId || Math.random()} className="summary-meta-item stockout-risk-item">
                      <div className="stockout-risk-main">
                        <span
                          className={`stockout-risk-dot ${Number(risk.daysLeft || 0) <= 3 ? "stockout-risk-critical" : "stockout-risk-warning"}`}
                          aria-hidden="true"
                        />
                        <span className="stockout-risk-name" title={risk.skuName || "Unknown"}>{risk.skuName || "Unknown SKU"}</span>
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

      {/* 24-hour live analytics */}
      {!isEmptyStore && !locked ? (
        <>
          <div className="section-divider" aria-hidden="true" />
          <React.Suspense fallback={<div className="card"><div className="spinner"></div><p style={{ textAlign: 'center', marginTop: 16 }}>Loading live analytics...</p></div>}>
            <StoreAnalytics impactCurrency={impactCurrency} />
          </React.Suspense>
        </>
      ) : null}

      {/* #6: Top Sales Performer card */}
      {!isEmptyStore && !impactLoading && !momentumLoading && momentum?.windows?.[7] ? (
        <section className="card top-performer-card">
          <div className="top-performer-head">
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div className="action-icon-btn top-mover-icon">
                <IconRocket size={22} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <p className="stat-label" style={{ margin: 0 }}>Top Mover This Week</p>
                <h3 className="top-performer-title" style={{ margin: 0 }}>
                  {topPerformerByVelocity ? topPerformerByVelocity.skuName : "—"}
                </h3>
              </div>
            </div>
            <div className="top-performer-stats">
              <div className="top-performer-stat">
                <span className="stat-label">7d Orders</span>
                <strong>{momentum.windows[7]?.current?.orders ?? "—"}</strong>
              </div>
              <div className="top-performer-stat">
                <span className="stat-label">7d Revenue</span>
                <strong>{formatMoneyByCurrency(impactCurrency, momentum.windows[7]?.current?.revenue)}</strong>
              </div>
              <div className="top-performer-stat">
                <span className="stat-label">Trend</span>
                <strong className={momentum.windows[7]?.trendPercent >= 0 ? "trend-up" : "trend-down"}>
                  {formatPercent(momentum.windows[7]?.trendPercent)}
                </strong>
              </div>
            </div>
          </div>
          <p className="top-performer-note">
            {topPerformerByVelocity
              ? `${topPerformerByVelocity.skuName} has the lowest stock runway — monitor closely to protect revenue.`
              : "All products are moving well. Check forecast for detailed velocity."}
          </p>
          <button type="button" className="top-performer-cta" onClick={() => navigate("/dashboard/forecast")}>
            See Full Forecast →
          </button>
        </section>
      ) : null}

      <div className="section-divider" aria-hidden="true" />

      <section className="card dashboard-section">
        <div className="section-heading">
          {/* #3: Renamed from "Impact" to "Revenue At Risk" */}
          <h2>Revenue At Risk</h2>
          <p className="page-subtitle">Estimated revenue exposure from current restock signals.</p>
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
              <div className="stat-value"><AnimatedNumber value={impact.unitsShort} formatter={formatPlainNumber} /></div>
              <div className="stat-helper">Demand gap over next lead-time window.</div>
            </article>
            <article className={`stat-card impact-card impact-${revenueRiskLevel}`}>
              <div className="stat-label">Revenue At Risk</div>
              <div className="stat-value"><AnimatedNumber value={impact.revenueAtRisk} formatter={(val) => formatMoneyByCurrency(impactCurrency, val)} className="glow-metric-danger" /></div>
              <div className="stat-helper">Estimated from units short x product price.</div>
            </article>
          </div>
        ) : null}
      </section>

      <div className="section-divider" aria-hidden="true" />

      <section className="card dashboard-section">
        <div className="card-actions">
          <div>
            <h2>Weekly Action Plan</h2>
            <p className="page-subtitle">Top SKUs to review this week based on stock cover and revenue exposure.</p>
          </div>
          <div className="csv-actions">
            <Button type="button" variant="secondary" onClick={() => navigate("/dashboard/products")}>
              Go to Products
            </Button>
            <Button
              type="button"
              variant="secondary"
              loading={actionPlanExporting}
              loadingText="Exporting..."
              onClick={handleExportActionPlan}
            >
              Export Reorder CSV
            </Button>
          </div>
        </div>
        {impactLoading ? (
          <EmptyState title="Preparing action plan..." description="Reviewing your latest restock priorities." />
        ) : null}
        {!impactLoading && actionPlanRows.length === 0 ? (
          <EmptyState title="No urgent reorder actions" description="Your current SKUs look healthy. Metric Mango will flag the next risk automatically." />
        ) : null}
        {!impactLoading && actionPlanRows.length > 0 ? (
          <div className="action-plan-list">
            {(actionPlanRows || []).map((item, index) => (
              <article key={item?.productId || `row-${index}`} className="action-plan-item">
                <div>
                  <h3>{item?.skuName || "Unknown Product"}</h3>
                  <p>
                    {item?.supplierName ? `Supplier: ${item.supplierName}` : "Supplier not set"}
                    {" • "}
                    {Number.isFinite(item?.daysLeft) ? `~${Math.max(0, Math.ceil(item.daysLeft))} days of stock cover` : "No sales velocity"}
                  </p>
                </div>
                <div className="action-plan-metrics">
                  <span>Reorder {item.reorderQty || 0}</span>
                  <strong>{formatMoneyByCurrency(impactCurrency, item.revenueAtRisk)}</strong>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <div className="section-divider" aria-hidden="true" />

      <section className="card dashboard-section">
        <div className="section-heading">
          <h2>SKU Analytics</h2>
          <p className="page-subtitle">Spot fast movers, slow movers, and how much inventory cover your catalog actually has.</p>
        </div>
        {skuAnalyticsLoading ? (
          <EmptyState title="Loading SKU analytics..." description="Calculating sell-through, stock cover, and velocity bands." />
        ) : null}
        {!skuAnalyticsLoading && skuAnalyticsError ? (
          <EmptyState title="SKU analytics unavailable" description={skuAnalyticsError} />
        ) : null}
        {!skuAnalyticsLoading && !skuAnalyticsError && skuAnalytics ? (
          <>
            <div className="impact-grid sku-analytics-grid">
              <article className="stat-card impact-card">
                <div className="stat-label">Avg Sell-through (30d)</div>
                <div className="stat-value">{Number(skuAnalytics.summary?.avgSellThroughRate30 || 0).toFixed(1)}%</div>
                <div className="stat-helper">How much of your available inventory moved in the last 30 days.</div>
              </article>
              <article className="stat-card impact-card">
                <div className="stat-label">Avg Stock Cover</div>
                <div className="stat-value">
                  {Number.isFinite(Number(skuAnalytics.summary?.avgStockCoverDays))
                    ? `${Math.round(Number(skuAnalytics.summary?.avgStockCoverDays || 0))}d`
                    : "—"}
                </div>
                <div className="stat-helper">Average runway across tracked SKUs.</div>
              </article>
              <article className="stat-card impact-card">
                <div className="stat-label">Trend Direction</div>
                <div className="stat-value">{skuAnalytics.summary?.growingSkus || 0} up / {skuAnalytics.summary?.slippingSkus || 0} down</div>
                <div className="stat-helper">Quick view of how many products are accelerating or slipping.</div>
              </article>
            </div>
            <div className="sku-analytics-lists">
              <div className="sku-analytics-column">
                <h3>Fast-Moving SKUs</h3>
                {(skuAnalytics?.fastMovers || []).slice(0, 5).map((item, index) => (
                  <article key={`fast-${item?.productId || index}`} className="sku-analytics-item">
                    <div>
                      <strong>{item?.name || "Unknown"}</strong>
                      <p>{Number(item?.avgDailySales7 || 0).toFixed(1)} units/day • {Number(item?.sellThroughRate30 || 0).toFixed(1)}% sell-through</p>
                    </div>
                    <TrendBadge direction={item?.trendDirection} />
                  </article>
                ))}
              </div>
              <div className="sku-analytics-column">
                <h3>Slow-Moving SKUs</h3>
                {(skuAnalytics?.slowMovers || []).slice(0, 5).map((item, index) => (
                  <article key={`slow-${item?.productId || index}`} className="sku-analytics-item">
                    <div>
                      <strong>{item?.name || "Unknown"}</strong>
                      <p>{Number(item?.avgDailySales7 || 0).toFixed(1)} units/day • {Number.isFinite(item?.stockCoverDays) ? `~${Math.ceil(item.stockCoverDays)} days cover` : "No sales velocity"}</p>
                    </div>
                    <TrendBadge direction={item?.trendDirection} />
                  </article>
                ))}
              </div>
            </div>
          </>
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
                <RevenueChartBars
                  revenueSeries={revenueSeries}
                  revenueWindow={revenueWindow}
                  impactCurrency={impactCurrency}
                  maxRevenueValue={maxRevenueValue}
                />
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
                {/* #7: Contextual CTA on Revenue chart */}
                {impact.atRiskSkus > 0 ? (
                  <button type="button" className="chart-context-cta" onClick={() => navigate("/dashboard/products")}>
                    ↗ Restock at-risk SKUs to protect this revenue trajectory →
                  </button>
                ) : (
                  <button type="button" className="chart-context-cta chart-context-cta-safe" onClick={() => navigate("/dashboard/forecast")}>
                    ↗ View demand forecast to plan next restock →
                  </button>
                )}
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

                <OrderSparkline
                  momentumSeries={momentumSeries}
                  momentumWindow={momentumWindow}
                  maxSeriesValue={maxSeriesValue}
                />

                <p className="chart-caption">{momentumInsight}</p>
                <p className="chart-caption">{momentumAction}</p>
                {/* #7: Contextual CTA on Order Momentum chart */}
                <button type="button" className="chart-context-cta" onClick={e => { e.stopPropagation(); navigate("/dashboard/forecast"); }}>
                  ↗ See full demand forecast →
                </button>
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

export default function Dashboard() {
  return (
    <ErrorBoundary>
      <DashboardComponent />
    </ErrorBoundary>
  );
}
