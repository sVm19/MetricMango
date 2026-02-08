import { useEffect, useState } from "react";
import "./App.css";
import { useTrialStatus } from "./trialStatus.jsx";
import UpgradeCTA from "./UpgradeCTA.jsx";

function App() {
  const {
    trialExpired,
    setTrialExpired,
    trialExpiredMessage,
    setTrialExpiredMessage
  } = useTrialStatus();
  const [currentPlan, setCurrentPlan] = useState("");
  const locked = trialExpired && currentPlan !== "active";
  const [pricing, setPricing] = useState(null);
  const [trialDaysLeft, setTrialDaysLeft] = useState(null);
  const [trialBannerDismissed, setTrialBannerDismissed] = useState(false);
  const [showProSuccess, setShowProSuccess] = useState(false);
  const [pricingError, setPricingError] = useState("");
  const [loadingPricing, setLoadingPricing] = useState(true);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState("");

  const API_BASE = import.meta.env.VITE_API_BASE || "";
  const STORE_ID = import.meta.env.VITE_STORE_ID || "demo-store";
  const API_KEY = import.meta.env.VITE_API_KEY || "";

  function createTrialExpiredError(message = "Your 7-day free trial has ended") {
    const error = new Error(message);
    error.code = "trial_expired";
    return error;
  }

  function allowRequestWhenTrialExpired(path) {
    return path === "/pricing" || path === "/stores" || path.startsWith("/billing/");
  }

  function applyPlanState(planValue) {
    const normalizedPlan = String(planValue || "").toLowerCase();
    setCurrentPlan(normalizedPlan);
    if (normalizedPlan === "active") {
      setTrialExpired(false);
      setTrialExpiredMessage("");
      setTrialDaysLeft(null);
      setShowProSuccess(true);
      return;
    }
    setShowProSuccess(false);
  }

  async function request(path, options = {}) {
    if (trialExpired && !allowRequestWhenTrialExpired(path)) {
      throw createTrialExpiredError(trialExpiredMessage || "Your 7-day free trial has ended");
    }

    const url = `${API_BASE}${path}`;
    const headers = {
      "content-type": "application/json",
      "x-store-id": STORE_ID,
      ...(API_KEY ? { authorization: `Bearer ${API_KEY}` } : {}),
      ...(options.headers || {})
    };

    const response = await fetch(url, { ...options, headers });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      data = { error: "Invalid JSON response" };
    }

    if (data?.error === "trial_expired") {
      setTrialExpired(true);
      setTrialDaysLeft(0);
      setTrialExpiredMessage(data?.message || "Your 7-day free trial has ended");
    }

    if (!response.ok) {
      const message = data?.message || data?.error || `Request failed (${response.status})`;
      if (data?.error === "trial_expired") {
        throw createTrialExpiredError(message);
      }
      throw new Error(message);
    }

    const trialDaysLeftHeader = Number(response.headers.get("x-trial-days-left"));
    if (Number.isFinite(trialDaysLeftHeader)) {
      setTrialDaysLeft(Math.max(0, trialDaysLeftHeader));
    }

    return data;
  }

  useEffect(() => {
    let active = true;
    if (currentPlan === "active") return () => {};

    async function syncStorePlan() {
      try {
        const storeData = await request("/stores");
        if (!active) return;
        applyPlanState(storeData?.plan);
      } catch (err) {
        if (!active) return;
      }
    }
    async function loadTrialStatus() {
      try {
        const data = await request("/dashboard/overview");
        if (!active) return;
        const days = Number(data?.trialDaysLeft);
        if (Number.isFinite(days)) {
          setTrialDaysLeft(Math.max(0, days));
        }
      } catch (err) {
        if (!active) return;
        if (err?.code === "trial_expired") return;
      }
    }
    async function loadPricing() {
      try {
        setLoadingPricing(true);
        setPricingError("");
        const data = await request("/pricing");
        if (!active) return;
        setPricing(data);
    } catch (err) {
      if (!active) return;
      if (err?.code === "trial_expired") return;
      setPricingError("Unable to load pricing right now.");
    } finally {
      if (active) setLoadingPricing(false);
      }
    }
    syncStorePlan();
    loadTrialStatus();
    loadPricing();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function syncStorePlan() {
      try {
        const storeData = await request("/stores");
        if (!active) return;
        applyPlanState(storeData?.plan);
      } catch (err) {
        if (!active) return;
      }
    }

    syncStorePlan();
    const interval = setInterval(syncStorePlan, 8000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [locked, upgradeLoading, currentPlan]);

  async function handleUpgrade() {
    if (upgradeLoading) return;
    setUpgradeError("");
    setUpgradeLoading(true);
    try {
      const headers = {
        "content-type": "application/json",
        "x-store-id": STORE_ID,
        ...(API_KEY ? { authorization: `Bearer ${API_KEY}` } : {})
      };

      // First try native redirect flow from backend.
      const upgradeResponse = await fetch(`${API_BASE}/billing/upgrade`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
        redirect: "manual"
      });

      const isRedirect = upgradeResponse.type === "opaqueredirect"
        || (upgradeResponse.status >= 300 && upgradeResponse.status < 400);
      if (isRedirect) {
        const locationHeader = upgradeResponse.headers.get("location");
        const redirectUrl = locationHeader
          ? new URL(locationHeader, `${API_BASE}/`).toString()
          : upgradeResponse.url;
        if (redirectUrl) {
          window.location.assign(redirectUrl);
          return;
        }
      }

      if (!upgradeResponse.ok) {
        let message = "";
        try {
          const errorBody = await upgradeResponse.json();
          message = String(errorBody?.error || errorBody?.message || "").trim();
        } catch (parseError) {
          const text = await upgradeResponse.text();
          message = String(text || "").trim();
        }
        throw new Error(message || "Unable to start checkout right now. Please try again.");
      }

      // Fallback to explicit JSON mode when redirect URL is not visible to fetch.
      const data = await request("/billing/upgrade?json=1", {
        method: "POST",
        body: JSON.stringify({})
      });
      const checkoutUrl = String(data?.checkoutUrl || "").trim();
      if (!checkoutUrl) {
        throw new Error("Missing checkout URL");
      }
      window.location.assign(checkoutUrl);
    } catch (err) {
      if (err?.code === "trial_expired") {
        setUpgradeError(err.message);
        return;
      }
      setUpgradeError(err?.message || "Upgrade failed. Please try again.");
    } finally {
      setUpgradeLoading(false);
    }
  }

  const billingProvider = String(pricing?.billingProvider || "").toLowerCase();
  const isIndiaPricing = billingProvider === "razorpay" || String(pricing?.currency || "").toUpperCase() === "INR";
  const priceText = isIndiaPricing ? "₹499 / month" : "$9 / month";
  const hasTrialDaysLeft = Number.isFinite(trialDaysLeft);
  const isPaid = currentPlan === "active";
  const showExpiredBanner = (trialExpired || trialDaysLeft === 0) && currentPlan !== "active";
  const isInTrial = currentPlan === "trial" && !showExpiredBanner;
  const showTrialBanner = !showExpiredBanner && hasTrialDaysLeft && trialDaysLeft > 0;
  const showBanner = showExpiredBanner || (showTrialBanner && !trialBannerDismissed);
  const bannerText = showExpiredBanner
    ? "Trial ended — upgrade to continue"
    : `${trialDaysLeft} days left in your free trial`;
  const ctaText = isInTrial ? "Continue trial" : "Buy Pro - ₹499 / $9";
  const forecastLocked = locked;
  const restockLocked = locked;
  const csvExportLocked = locked;

  async function handlePricingCta() {
    if (isInTrial) {
      const dashboardSection = document.getElementById("dashboard");
      if (dashboardSection) {
        dashboardSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }
    await handleUpgrade();
  }

  return (
    <div className="locked-page">
      <nav className="top-nav" aria-label="Primary">
        <a href="#dashboard">Dashboard</a>
        <a href="#forecast">Forecast</a>
        <a href="#restock">Restock</a>
        <a href="#exports">Exports</a>
      </nav>
      {showBanner ? (
        <section className={`trial-banner ${showExpiredBanner ? "is-expired" : ""}`} role="status" aria-live="polite">
          <span>{bannerText}</span>
          {showTrialBanner ? (
            <button
              type="button"
              className="trial-banner-dismiss"
              onClick={() => setTrialBannerDismissed(true)}
            >
              Dismiss
            </button>
          ) : null}
        </section>
      ) : null}
      {showProSuccess ? (
        <section className="pro-success-banner" role="status" aria-live="polite">
          You&apos;re now on Pro 🎉
        </section>
      ) : null}

      <header className="locked-hero">
        <span className="hero-pill">One plan. One price. All features.</span>
        <h1>{currentPlan === "active" ? "Pro is now active" : "Your free trial has ended"}</h1>
        <p>
          {currentPlan === "active"
            ? "All premium features are now unlocked for your store."
            : "One plan. One price. All features. Start with a 7-day free trial."}
        </p>
        {upgradeError ? <div className="upgrade-error">{upgradeError}</div> : null}
        {pricingError ? <div className="upgrade-error">{pricingError}</div> : null}
      </header>
      {!isPaid ? (
        <section className="single-upgrade-cta" aria-label="Upgrade">
          <UpgradeCTA
            onUpgrade={handlePricingCta}
            loading={upgradeLoading}
            disabled={loadingPricing}
            priceText={priceText}
            ctaText={ctaText}
          />
        </section>
      ) : null}

      <section id="dashboard" className="lockable">
        <div className="lockable-content">
          <div className="section-header">
            <h2>Dashboard</h2>
            <button className="action-btn" type="button" disabled={locked}>
              {locked ? "Refresh disabled on trial end" : "Refresh stats"}
            </button>
          </div>
          <div className="stat-row">
            <div>
              <div className="stat-label">Today revenue</div>
              <div className="stat-value">₹28,400</div>
            </div>
            <div>
              <div className="stat-label">Orders today</div>
              <div className="stat-value">146</div>
            </div>
            <div>
              <div className="stat-label">Conversion</div>
              <div className="stat-value">3.9%</div>
            </div>
          </div>
        </div>
      </section>

      <section id="forecast" className={`lockable ${forecastLocked ? "is-locked" : ""}`}>
        <div className="lockable-content" inert={forecastLocked ? "" : undefined} aria-disabled={forecastLocked}>
          <div className="section-header">
            <h2>Forecast</h2>
            <span className="section-note">7-day projection</span>
          </div>
          <div className="stat-row">
            <div>
              <div className="stat-label">Expected demand</div>
              <div className="stat-value">124 units</div>
            </div>
            <div>
              <div className="stat-label">Restock window</div>
              <div className="stat-value">5 days</div>
            </div>
            <div>
              <div className="stat-label">Best seller</div>
              <div className="stat-value">Mango Serum</div>
            </div>
          </div>
        </div>
        {forecastLocked ? (
          <div className="lock-overlay" role="status" aria-live="polite">
            <div className="lock-message">Your free trial has ended</div>
          </div>
        ) : null}
      </section>

      <section id="restock" className={`lockable ${restockLocked ? "is-locked" : ""}`}>
        <div className="lockable-content" inert={restockLocked ? "" : undefined} aria-disabled={restockLocked}>
          <div className="section-header">
            <h2>Restock Signals</h2>
            <span className="section-note">Live stock health</span>
          </div>
          <div className="list-grid">
            <div className="list-item">
              <div className="list-title">Low stock risk</div>
              <div className="list-value">8 products</div>
            </div>
            <div className="list-item">
              <div className="list-title">Healthy stock</div>
              <div className="list-value">34 products</div>
            </div>
            <div className="list-item">
              <div className="list-title">Reorder now</div>
              <div className="list-value">Mango Sheet Mask</div>
            </div>
          </div>
        </div>
        {restockLocked ? (
          <div className="lock-overlay" role="status" aria-live="polite">
            <div className="lock-message">Your free trial has ended</div>
          </div>
        ) : null}
      </section>

      <section id="exports" className={`lockable ${csvExportLocked ? "is-hard-locked" : ""}`}>
        <div className="lockable-content" inert={csvExportLocked ? "" : undefined} aria-disabled={csvExportLocked}>
          <div className="section-header">
            <h2>CSV Export</h2>
            <span className="section-note">Orders and products</span>
          </div>
          <div className="list-grid">
            <div className="list-item">
              <div className="list-title">Orders CSV</div>
              <button className="action-btn" type="button" disabled={csvExportLocked}>
                Export Orders
              </button>
            </div>
            <div className="list-item">
              <div className="list-title">Products CSV</div>
              <button className="action-btn" type="button" disabled={csvExportLocked}>
                Export Products
              </button>
            </div>
          </div>
        </div>
        {csvExportLocked ? (
          <div className="lock-overlay" role="status" aria-live="polite">
            <div className="lock-card">
              <div className="lock-title">Your free trial has ended</div>
              <div className="lock-subtitle">
                CSV export is fully locked on trial expiry.
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default App;
