import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import {
  getPricing,
  getRetentionStatus,
  postRetentionHeartbeat,
  requestCancellation,
  requestPause
} from "../api.js";

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

const CANCEL_REASONS = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "not_using_enough", label: "Not using it enough" },
  { value: "missing_feature", label: "Missing a feature" },
  { value: "technical_issues", label: "Technical issues" },
  { value: "seasonal", label: "Seasonal / temporary" },
  { value: "switching_to_competitor", label: "Switching to another tool" },
  { value: "business_closed", label: "Business changed" },
  { value: "other", label: "Other" }
];

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
  const [retention, setRetention] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retentionLoading, setRetentionLoading] = useState(true);
  const [reason, setReason] = useState("too_expensive");
  const [note, setNote] = useState("");
  const [requestState, setRequestState] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestSuccess, setRequestSuccess] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    postRetentionHeartbeat("pricing").catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        const data = await getPricing();
        if (!active) return;
        setPricing(data);
      } catch {
        if (!active) return;
        setPricing(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadRetention() {
      try {
        setRetentionLoading(true);
        const data = await getRetentionStatus();
        if (!active) return;
        setRetention(data);
      } catch {
        if (!active) return;
        setRetention(null);
      } finally {
        if (active) setRetentionLoading(false);
      }
    }
    loadRetention();
    return () => {
      active = false;
    };
  }, []);

  const currency = pricing?.currency;
  const monthlyAmount = pricing?.amount;
  const trialDays = Number.isFinite(pricing?.trialDays) ? pricing.trialDays : 7;
  const monthlyLabel = formatPrice(monthlyAmount, currency);
  const activeOffer = useMemo(() => retention?.saveOffers?.[reason] || null, [reason, retention]);

  async function handlePauseRequest() {
    setRequestState("pause");
    setRequestError("");
    setRequestSuccess("");
    try {
      const response = await requestPause({ reason, note });
      setRequestSuccess(`Pause request received${response?.pauseDays ? ` for ${response.pauseDays} days` : ""}.`);
      setRetention(current => current ? {
        ...current,
        latestRequest: {
          id: response.requestId,
          type: "pause",
          reason,
          status: response.status,
          saveOffer: response.saveOffer,
          createdAt: new Date().toISOString()
        }
      } : current);
    } catch (error) {
      setRequestError(error?.data?.error || error?.message || "Unable to submit pause request.");
    } finally {
      setRequestState("");
    }
  }

  async function handleCancelRequest() {
    setRequestState("cancel");
    setRequestError("");
    setRequestSuccess("");
    try {
      const response = await requestCancellation({ reason, note });
      setRequestSuccess("Cancellation request received. We will review it with your reason and follow up.");
      setRetention(current => current ? {
        ...current,
        latestRequest: {
          id: response.requestId,
          type: "cancel",
          reason,
          status: response.status,
          saveOffer: response.saveOffer,
          createdAt: new Date().toISOString()
        }
      } : current);
    } catch (error) {
      setRequestError(error?.data?.error || error?.message || "Unable to submit cancellation request.");
    } finally {
      setRequestState("");
    }
  }

  return (
    <div className="pricing-page pricing-page-expanded">
      <div className="pricing-hero">
        <div>
          <h2>One plan. All features.</h2>
          <p className="pricing-subtitle">
            Keep pricing simple, but give merchants clear off-ramps before they churn.
          </p>
        </div>
      </div>

      <div className="pricing-grid single">
        <div className="pricing-card">
          <div>
            <div className="plan-eyebrow">{PLAN.name}</div>
            <h3>All features included</h3>
            <div className="price">
              {loading ? "Loading..." : formatPrice(monthlyAmount, currency)}
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

          <Button type="button" variant="primary" fullWidth onClick={() => navigate("/dashboard/payment/" + (currency === "USD" ? "global" : "india"))}>
            {PLAN.cta}
          </Button>
        </div>
      </div>

      <section className="card dashboard-section retention-section">
        <div className="section-heading">
          <h2>Pause Or Cancel</h2>
          <p className="page-subtitle">Use a reason-based flow instead of a dead-end cancel button.</p>
        </div>
        {retentionLoading ? (
          <p className="stat-helper">Loading retention options...</p>
        ) : (
          <>
            <div className="retention-grid">
              <label className="settings-field">
                <span>Why are you considering leaving?</span>
                <select value={reason} onChange={event => setReason(event.target.value)}>
                  {CANCEL_REASONS.map(item => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="settings-field settings-field-wide">
                <span>Anything we should know?</span>
                <textarea rows="4" value={note} onChange={event => setNote(event.target.value)} placeholder="Short note for support or product feedback" />
              </label>
            </div>

            {activeOffer ? (
              <div className="retention-offer-card">
                <div>
                  <p className="plan-eyebrow">Recommended Save Offer</p>
                  <h3>{activeOffer.title}</h3>
                  <p>{activeOffer.description}</p>
                </div>
                <div className="retention-offer-actions">
                  <Button type="button" variant="secondary" loading={requestState === "pause"} loadingText="Sending..." onClick={handlePauseRequest}>
                    {activeOffer.primaryAction || "Request pause"}
                  </Button>
                  <Button type="button" variant="danger" loading={requestState === "cancel"} loadingText="Sending..." onClick={handleCancelRequest}>
                    Continue To Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="retention-status-card">
              <div>
                <p className="stat-label">Usage health</p>
                <strong>
                  {retention?.inactiveDays === null || retention?.inactiveDays === undefined
                    ? "Not enough data yet"
                    : `${retention.inactiveDays} inactive day${retention.inactiveDays === 1 ? "" : "s"}`}
                </strong>
              </div>
              <div>
                <p className="stat-label">Recommended intervention</p>
                <strong>{retention?.recommendedIntervention || "healthy"}</strong>
              </div>
              <div>
                <p className="stat-label">Latest request</p>
                <strong>{retention?.latestRequest ? `${retention.latestRequest.type} • ${retention.latestRequest.status}` : "None"}</strong>
              </div>
            </div>
          </>
        )}
        {requestSuccess ? <p className="form-message form-message-success">{requestSuccess}</p> : null}
        {requestError ? <p className="form-message form-message-error">{requestError}</p> : null}
      </section>

      <section className="card dashboard-section packaging-section">
        <div className="section-heading">
          <h2>Packaging Review</h2>
          <p className="page-subtitle">Do the work now so future tiers are based on actual upgrade pressure, not guesses.</p>
        </div>
        <div className="packaging-grid">
          <article className="packaging-card">
            <p className="plan-eyebrow">Starter Candidate</p>
            <h3>Stay simple</h3>
            <ul className="feature-list compact">
              <li>Forecasting and basic restock alerts</li>
              <li>One alert recipient</li>
              <li>CSV exports</li>
            </ul>
          </article>
          <article className="packaging-card">
            <p className="plan-eyebrow">Growth Candidate</p>
            <h3>Add actionability</h3>
            <ul className="feature-list compact">
              <li>Supplier directory and PO drafts</li>
              <li>Advanced SKU analytics</li>
              <li>Retention and re-engagement flows</li>
            </ul>
          </article>
        </div>
      </section>
    </div>
  );
}
