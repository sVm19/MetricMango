import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { FaRegEye, FaRegEyeSlash } from "react-icons/fa";
import { FiMoon, FiSun } from "react-icons/fi";
import {
  IconUserPlus,
  IconRefresh,
  IconChartBar,
  IconClipboardList,
  IconCircleCheck
} from "@tabler/icons-react";
import Button from "./components/Button.jsx";
import DashboardPage from "./pages/Dashboard.jsx";
import ProductsPage from "./pages/Products.jsx";
import ForecastPage from "./pages/Forecast.jsx";
import PricingPage from "./pages/Pricing.jsx";
import PaymentPage from "./pages/Payment.jsx";
import PrivacyPolicy from "./pages/PrivacyPolicy.jsx";
import TermsOfService from "./pages/TermsOfService.jsx";
import LeadMagnet from "./components/LeadMagnet.jsx";
import { useAuth } from "./auth/AuthContext.jsx";
import { useAccess } from "./access/AccessContext.jsx";
import { connectShopifyStore, disconnectShopifyStore, getOnboardingStatus } from "./api.js";
import { useEmbedded } from "./useEmbedded.js";

const THEME_MODE_KEY = "metric-mango.theme-mode";
const THEME_MODE_SEQUENCE = ["light", "dark"];

function getInitialThemeMode() {
  if (typeof window === "undefined") return "dark";
  const storedMode = String(window.localStorage.getItem(THEME_MODE_KEY) || "").toLowerCase();
  if (THEME_MODE_SEQUENCE.includes(storedMode)) return storedMode;
  return "dark";
}

function resolveThemeMode(mode) {
  return mode === "dark" ? "dark" : "light";
}

function nextThemeMode(currentMode) {
  const currentIndex = THEME_MODE_SEQUENCE.indexOf(currentMode);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % THEME_MODE_SEQUENCE.length;
  return THEME_MODE_SEQUENCE[nextIndex];
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidShopifyStoreName(value) {
  return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/.test(String(value || "").trim());
}

function mapAuthError(err) {
  const code = err?.code || "";
  if (code === "auth/email-already-in-use") return "Email is already registered.";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/weak-password") return "Password must be at least 6 characters.";
  if (code === "auth/invalid-credential") return "Invalid email or password.";
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait and try again.";
  if (code === "app/signup-initialization-failed") return "Account created but setup did not finish. Please sign in again.";
  return "Unable to continue right now. Please try again.";
}

function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoadingPage message="Checking authentication..." />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function ProtectedRoute({ children }) {
  const location = useLocation();
  const { user, loading, storeContextReady, mappingError, onboardingRequired } = useAuth();
  const { loading: accessLoading } = useAccess();

  if (loading || accessLoading) return <AuthLoadingPage message="Loading dashboard..." />;
  if (!user) return <Navigate to="/signin" replace />;
  if (!storeContextReady) {
    return (
      <div className="auth-shell">
        <section className="auth-card auth-loading-card">
          {mappingError ? null : <div className="spinner" aria-label="Loading store mapping" />}
          <p className="auth-subtitle">{mappingError || "Connecting your account to your store..."}</p>
        </section>
      </div>
    );
  }
  if (onboardingRequired && !location.pathname.startsWith("/dashboard/onboarding")) {
    return <Navigate to="/dashboard/onboarding" replace />;
  }
  return children;
}

function AuthLoadingPage({ message }) {
  return (
    <div className="auth-shell">
      <section className="auth-card auth-loading-card">
        <div className="spinner" aria-label="Loading authentication state" />
        <p className="auth-subtitle">{message}</p>
      </section>
    </div>
  );
}

function LandingAuthModal({ open, mode, onClose, onAuthSuccess }) {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const [tab, setTab] = useState(mode || "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTab(mode || "signin");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setSubmitting(false);
  }, [open, mode]);

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    setSubmitting(true);
    setError("");

    try {
      if (!isValidEmail(normalizedEmail)) {
        setError("Enter a valid email address.");
        return;
      }

      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }

      if (tab === "signup" && password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      if (tab === "signup") {
        await signUp(normalizedEmail, password);
      } else {
        await signIn(normalizedEmail, password);
      }

      onClose();
      // After successful auth, trigger success callback to navigate to payment
      if (onAuthSuccess) {
        onAuthSuccess();
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="mm-auth-overlay"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="mm-auth-modal" role="dialog" aria-modal="true" aria-labelledby="landing-auth-title">
        <button type="button" className="mm-auth-close" aria-label="Close authentication modal" onClick={onClose}>
          &times;
        </button>
        <p className="mm-auth-eyebrow">Metric Mango Access</p>
        <h2 id="landing-auth-title">Sign in to your account</h2>
        <div className="mm-auth-tabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "signup"}
            className={`mm-auth-tab ${tab === "signup" ? "active" : ""}`}
            onClick={() => setTab("signup")}
          >
            Sign Up
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "signin"}
            className={`mm-auth-tab ${tab === "signin" ? "active" : ""}`}
            onClick={() => setTab("signin")}
          >
            Sign In
          </button>
        </div>

        <button
          type="button"
          className="mm-google-btn"
          onClick={() => setError("Google OAuth is coming soon. Use email and password for now.")}
        >
          <span aria-hidden="true">G</span>
          Continue with Google
        </button>

        <form className="mm-auth-form" onSubmit={handleSubmit}>
          <label htmlFor="landing-auth-email">Work email</label>
          <input
            id="landing-auth-email"
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            placeholder="you@store.com"
            autoComplete="email"
            required
          />

          <label htmlFor="landing-auth-password">Password</label>
          <input
            id="landing-auth-password"
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            autoComplete={tab === "signup" ? "new-password" : "current-password"}
            minLength={6}
            required
          />

          {tab === "signup" ? (
            <>
              <label htmlFor="landing-auth-confirm-password">Confirm password</label>
              <input
                id="landing-auth-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </>
          ) : null}

          {error ? <p className="mm-auth-error">{error}</p> : null}
          <button type="submit" className="mm-auth-submit" disabled={submitting}>
            {submitting ? "Please wait..." : tab === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>
      </section>
    </div>
  );
}

function LandingPage({ themeMode, onToggleTheme }) {
  const navigate = useNavigate();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState(null);
  const [authMode, setAuthMode] = useState("signin");
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const aboutDropdownRef = useRef(null);
  const howItWorksOpenRef = useRef(false);
  const howItWorksScrollTimerRef = useRef(null);
  const howItWorksCloseTimerRef = useRef(null);
  const resolvedTheme = resolveThemeMode(themeMode);

  const [detectedStore, setDetectedStore] = useState(null);

  useEffect(() => {
    let active = true;
    fetch('https://get.geojs.io/v1/ip/country.json')
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        if (data.country === 'IN') {
          setDetectedStore('india');
        } else {
          setDetectedStore('global');
        }
      })
      .catch(() => {
        if (active) setDetectedStore('global'); // fallback
      });
    return () => { active = false; };
  }, []);

  function openAuthModal(mode) {
    setAuthMode(mode || "signin");
    setIsAuthModalOpen(true);
  }

  const toggleHowItWorks = useCallback(() => {
    const section = document.getElementById("how-it-works");
    const btn = document.getElementById("how-it-works-btn");
    if (!section || !btn) return;

    if (howItWorksScrollTimerRef.current) {
      window.clearTimeout(howItWorksScrollTimerRef.current);
      howItWorksScrollTimerRef.current = null;
    }
    if (howItWorksCloseTimerRef.current) {
      window.clearTimeout(howItWorksCloseTimerRef.current);
      howItWorksCloseTimerRef.current = null;
    }

    if (!howItWorksOpenRef.current) {
      section.style.display = "block";
      section.style.transition = "none";
      section.style.animation = "none";
      void section.offsetWidth;
      section.style.animation = "revealSection 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards";
      howItWorksOpenRef.current = true;
      setIsHowItWorksOpen(true);
      howItWorksScrollTimerRef.current = window.setTimeout(() => {
        const offset = 80;
        const top = section.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: "smooth" });
      }, 50);
      return;
    }

    section.style.animation = "none";
    section.style.opacity = "0";
    section.style.transform = "translateY(-16px)";
    section.style.transition = "opacity 0.3s ease, transform 0.3s ease";
    howItWorksCloseTimerRef.current = window.setTimeout(() => {
      section.style.display = "none";
      section.style.transition = "none";
      section.style.opacity = "0";
      section.style.transform = "translateY(-16px)";
      howItWorksCloseTimerRef.current = null;
    }, 300);
    howItWorksOpenRef.current = false;
    setIsHowItWorksOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key !== "Escape") return;
      if (isAuthModalOpen) return;
      if (isAboutOpen) {
        setIsAboutOpen(false);
        return;
      }
      if (!howItWorksOpenRef.current) return;
      toggleHowItWorks();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAuthModalOpen, isAboutOpen, toggleHowItWorks]);

  useEffect(() => {
    return () => {
      if (howItWorksScrollTimerRef.current) window.clearTimeout(howItWorksScrollTimerRef.current);
      if (howItWorksCloseTimerRef.current) window.clearTimeout(howItWorksCloseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (aboutDropdownRef.current && !aboutDropdownRef.current.contains(event.target)) {
        setIsAboutOpen(false);
      }
    }
    if (isAboutOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isAboutOpen]);

  return (
    <div className="mm-landing-shell">
      <header className="mm-navbar">
        <div className="mm-navbar-inner">
          <Link className="mm-logo" to="/" aria-label="Metric Mango home">
            <img className="mm-logo-image" src={resolvedTheme === "dark" ? "/logo-dark.svg" : "/logo.svg"} alt="Metric Mango" width="174" height="58" />
          </Link>
          <nav className="mm-navbar-links" aria-label="Landing navigation">
            <a href="#features">Features</a>
            <span className="mm-about-wrap" ref={aboutDropdownRef}>
              <button
                id="about-btn"
                type="button"
                className="mm-about-trigger"
                aria-expanded={isAboutOpen}
                aria-haspopup="true"
                onClick={() => setIsAboutOpen(prev => !prev)}
              >
                About
              </button>
              {isAboutOpen ? (
                <div id="about-dropdown" className="mm-about-dropdown">
                  {/* Founder identity removed as requested */}
                  <p className="mm-about-blurb">
                    Built Metric Mango to solve the exact inventory problem we faced
                    running our own Shopify store. No VC funding. No enterprise pricing.
                    Just a tool that works.
                  </p>
                  <hr className="mm-about-divider" />
                  <a
                    href="https://www.linkedin.com/in/shubham-kumar-528099213/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mm-about-linkedin"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#5BA4F5">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037
                      -1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046
                      c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286z
                      M5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063
                      2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0
                      .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24
                      23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                    Connect on LinkedIn
                  </a>
                  <a
                    href="mailto:team@metricmango.store"
                    className="mm-about-email"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f5c518" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="M22 4L12 13L2 4" />
                    </svg>
                    team@metricmango.store
                  </a>
                </div>
              ) : null}
            </span>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="mm-navbar-actions">
            <button
              type="button"
              className="theme-toggle-btn theme-toggle-icon-btn mm-theme-toggle"
              onClick={onToggleTheme}
              title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {resolvedTheme === "dark" ? <FiMoon aria-hidden="true" /> : <FiSun aria-hidden="true" />}
            </button>
            <button type="button" className="mm-nav-auth-btn" onClick={() => openAuthModal("signin")}>
              Sign In / Sign Up
            </button>
          </div>
        </div>
      </header>

      <main className="mm-landing-main">
        <section className="mm-hero" id="top">
          <div className="mm-hero-glow" aria-hidden="true" />
          <span className="mm-hero-badge mm-fade-up mm-delay-1">For Shopify Store Owners</span>
          <h1 className="mm-display mm-fade-up mm-delay-2">Stop Guessing When to Restock.</h1>
          <p className="mm-fade-up mm-delay-3">
            Get automated low-stock email alerts and simple demand forecasts. Never let a bestseller go out of stock or manage another complex inventory spreadsheet again.
          </p>
          <div className="mm-feature-pills mm-fade-up mm-delay-4">
            <span>7/14/30-Day Run Rates</span>
            <span>Active Restock Alerts</span>
            <span>Weekly Priority Reports</span>
          </div>
          <div className="mm-hero-ctas mm-fade-up mm-delay-5">
            <button type="button" className="mm-cta mm-cta-primary" onClick={() => openAuthModal("signup")}>
              Start My Free Trial
            </button>
          </div>
          <p className="mm-trust-whisper mm-fade-up mm-delay-6">
            <strong><i>"Just plug in and go. The cheapest insurance policy against lost revenue."</i></strong>
          </p>
          <button
            id="how-it-works-btn"
            type="button"
            className="mm-cta mm-cta-primary mm-how-link mm-fade-up mm-delay-6"
            onClick={toggleHowItWorks}
          >
            {isHowItWorksOpen ? "Got it ↑" : "How it works →"}
          </button>
        </section>

        <section className="mm-how-wrap" id="how-it-works">
          <div className="mm-how-it-works">
            <p className="mm-how-eyebrow">How It Works</p>
            <h2>From install to your first stockout alert in under 2 minutes.</h2>
            <p className="mm-how-subline">No demo call. No setup wizard. No waiting for someone to onboard you.</p>



            <div className="mm-how-flow">
              <article className="mm-how-step">
                <span className="mm-how-step-badge">01</span>
                <div className="mm-how-step-icon-container">
                  <IconUserPlus size={28} stroke={1.5} color="#F5C518" />
                </div>
                <h3>Sign up &amp; connect your store</h3>
                <p>Create your account and enter your Shopify store name. That&apos;s all we need - no API keys, no copy-pasting, no tech setup.</p>
              </article>

              <article className="mm-how-step">
                <span className="mm-how-step-badge">02</span>
                <div className="mm-how-step-icon-container">
                  <IconRefresh size={28} stroke={1.5} color="#F5C518" />
                </div>
                <h3>We sync your store data</h3>
                <p>Your sales history, product catalog, and order data sync automatically. No CSV uploads. No manual mapping.</p>
              </article>

              <article className="mm-how-step">
                <span className="mm-how-step-badge">03</span>
                <div className="mm-how-step-icon-container">
                  <IconChartBar size={28} stroke={1.5} color="#F5C518" />
                </div>
                <h3>Your dashboard goes live</h3>
                <p>Within minutes you&apos;ll see your top at-risk SKUs, demand forecasts, and a full revenue overview - ready to act on.</p>
              </article>

              <article className="mm-how-step">
                <span className="mm-how-step-badge">04</span>
                <div className="mm-how-step-icon-container">
                  <IconClipboardList size={28} stroke={1.5} color="#F5C518" />
                </div>
                <h3>Get your weekly action report</h3>
                <p>Every week, Metric Mango sends your team a prioritized restock list. No login needed - just open, read, act.</p>
              </article>
            </div>

            <div className="mm-how-chips">
              <span className="mm-chip" style={{ display: 'flex', alignItems: 'center' }}>
                <IconCircleCheck size={15} stroke={2} color="#F5C518" style={{ marginRight: '5px', flexShrink: 0 }} />
                No credit card to install
              </span>
              <span className="mm-chip" style={{ display: 'flex', alignItems: 'center' }}>
                <IconCircleCheck size={15} stroke={2} color="#F5C518" style={{ marginRight: '5px', flexShrink: 0 }} />
                Works with any Shopify plan
              </span>
              <span className="mm-chip" style={{ display: 'flex', alignItems: 'center' }}>
                <IconCircleCheck size={15} stroke={2} color="#F5C518" style={{ marginRight: '5px', flexShrink: 0 }} />
                Cancel anytime in one click
              </span>
            </div>

            <div className="mm-how-compare">
              <p className="mm-how-compare-muted">Other tools: 3-week onboarding, sales call required, USD pricing.</p>
              <p className="mm-how-compare-strong">Metric Mango: 2 minutes.</p>
            </div>

            <div className="mm-how-cta-wrap">
              <button type="button" className="mm-cta mm-cta-secondary" onClick={() => openAuthModal("signup")}>
                Start My Free Trial
              </button>
              <p>No credit card required. Cancel anytime.</p>
              <p>Join stores already using Metric Mango to prevent stockouts.</p>
            </div>
          </div>
        </section>

        <section className="mm-stats-bar" aria-label="Core value metrics">
          <article>
            <strong>2 min</strong>
            <span>to get first risk report</span>
          </article>
          <article>
            <strong>7/14/30d</strong>
            <span>demand windows for planning</span>
          </article>
          <article>
            <strong>1 plan</strong>
            <span>all features included</span>
          </article>
        </section>

        <LeadMagnet />

        <section className="mm-features" id="features">
          <div className="mm-section-head">
            <p className="mm-kicker">The End of Stockout Anxiety</p>
            <h2>Everything you need to order the right inventory at the right time.</h2>
          </div>
          <div className="mm-feature-grid">
            <article className="mm-feature-card">
              <h3>Demand Forecasts</h3>
              <p>See your exact 7, 14, and 30-day run rates before your bestsellers run dry.</p>
            </article>
            <article className="mm-feature-card">
              <h3>Restock Priorities</h3>
              <p>Know exactly which SKUs need reordering today based on actual sales momentum.</p>
            </article>
            <article className="mm-feature-card">
              <h3>Active Email Alerts</h3>
              <p>Get proactive email warnings when a product is 5 days from hitting zero. No login required.</p>
            </article>
          </div>
        </section>

        <div className="mm-ps-row">
          {/* Pricing card */}
          <section className="mm-pricing" id="pricing">
            <p className="mm-kicker">Pricing</p>
            <h2>One plan. No tiers.</h2>
            <p>Start with a 7-day free trial and get full access from day one.</p>
            <div className="mm-pricing-grid">
              {detectedStore === 'india' ? (
                <article className="mm-pricing-item" onClick={() => { setSelectedStore('india'); openAuthModal('signup'); }} style={{ cursor: 'pointer' }}>
                  <h3>India Stores</h3>
                  <p className="mm-pricing-amount">₹499<span>/month</span></p>
                  <p className="mm-pricing-note">For merchants billed in INR.</p>
                </article>
              ) : null}
              {detectedStore === 'global' ? (
                <article className="mm-pricing-item" onClick={() => { setSelectedStore('global'); openAuthModal('signup'); }} style={{ cursor: 'pointer' }}>
                  <h3>Global Stores</h3>
                  <p className="mm-pricing-amount">$9<span>/month</span></p>
                  <p className="mm-pricing-note">For non-India merchants billed in USD.</p>
                </article>
              ) : null}
            </div>
          </section>

          {/* About card */}
          <section className="mm-about-section" id="about-us">
            <p className="mm-kicker">About Us</p>
            <h2>Built by a store owner, for store owners.</h2>
            {/* Founder identity removed as requested */}
            <p className="mm-about-section-blurb">
              Built Metric Mango to solve the exact inventory problem we faced running our own Shopify store.
              No VC funding. No enterprise pricing. Just a tool that works.
            </p>
            <div className="mm-about-section-links">
              <a
                href="https://www.linkedin.com/in/shubham-kumar-528099213/"
                target="_blank"
                rel="noopener noreferrer"
                className="mm-about-section-link mm-about-section-link--linkedin"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
                Connect on LinkedIn
              </a>
              <a
                href="mailto:team@metricmango.store"
                className="mm-about-section-link mm-about-section-link--email"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M22 4L12 13L2 4" />
                </svg>
                team@metricmango.store
              </a>
            </div>
          </section>
        </div>

      </main>

      <footer className="mm-footer">
        <div className="mm-footer-links">
          <Link to="/privacy-policy" className="mm-footer-link">Privacy Policy</Link>
          <Link to="/terms-of-service" className="mm-footer-link">Terms of Service</Link>
        </div>
        <p className="mm-copyright">© {new Date().getFullYear()} Metric Mango. All rights reserved.</p>
      </footer>

      <LandingAuthModal open={isAuthModalOpen} mode={authMode} onClose={() => setIsAuthModalOpen(false)} onAuthSuccess={() => {
        // navigate to payment page based on selectedStore
        const target = selectedStore ? `/dashboard/payment/${selectedStore}` : '/dashboard';
        navigate(target, { replace: true });
      }} />
    </div>
  );
}

function AuthPage({ mode }) {
  const navigate = useNavigate();
  const { signIn, signUp, requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      if (!isValidEmail(normalizedEmail)) {
        setError("Enter a valid email address.");
        return;
      }

      if (mode === "signup" && password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }

      if (mode === "signup" && password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      if (mode === "forgot") {
        await requestPasswordReset(normalizedEmail);
        setSuccess("Password reset email sent.");
        return;
      }

      if (mode === "signup") {
        await signUp(normalizedEmail, password);
      } else {
        await signIn(normalizedEmail, password);
      }
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === "signup" ? "Create account" : mode === "forgot" ? "Reset password" : "Sign in";
  const subtitle = mode === "signup"
    ? "Start your 7-day free trial. No credit card required."
    : mode === "forgot"
      ? "Enter your email and we will send a reset link."
      : "Welcome back. Sign in to continue.";

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <h2>{title}</h2>
        <p className="auth-subtitle">{subtitle}</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            autoComplete="email"
            required
          />

          {mode !== "forgot" ? (
            <>
              <label htmlFor="auth-password">Password</label>
              <div className="password-field-wrapper">
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? "Hide password" : "Show password"}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <FaRegEyeSlash aria-hidden="true" /> : <FaRegEye aria-hidden="true" />}
                </button>
              </div>

              {mode === "signup" ? (
                <>
                  <label htmlFor="auth-confirm-password">Re-enter password</label>
                  <div className="password-field-wrapper">
                    <input
                      id="auth-confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={event => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      minLength={6}
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      title={showConfirmPassword ? "Hide password" : "Show password"}
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? <FaRegEyeSlash aria-hidden="true" /> : <FaRegEye aria-hidden="true" />}
                    </button>
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          {error ? <div className="auth-error">{error}</div> : null}
          {success ? <div className="auth-success">{success}</div> : null}
          <Button type="submit" variant="primary" loading={submitting} loadingText="Please wait...">
            {mode === "signup" ? "Sign up" : mode === "forgot" ? "Send reset email" : "Sign in"}
          </Button>
        </form>
        {mode === "signin" ? (
          <>
            <Link className="auth-link" to="/signup">Need an account? Sign up</Link>
            <Link className="auth-link" to="/signin?forgot=1">Forgot your password?</Link>
          </>
        ) : null}
        {mode === "signup" ? <Link className="auth-link" to="/signin">Already have an account? Sign in</Link> : null}
        {mode === "forgot" ? <Link className="auth-link" to="/signin">Back to sign in</Link> : null}
      </section>
    </div>
  );
}

function DashboardLayout({ themeMode, onToggleTheme }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, sessionExpired, isFirebaseConfigured, onboardingRequired } = useAuth();
  const { accessState, locked, overview } = useAccess();
  const resolvedTheme = resolveThemeMode(themeMode);

  const { isEmbedded } = useEmbedded();

  async function handleLogout() {
    await logout();
    navigate("/signin", { replace: true });
  }

  if (!isFirebaseConfigured) {
    return (
      <div className="auth-shell">
        <section className="auth-card">
          <h2>Firebase Auth Not Configured</h2>
          <p className="auth-subtitle">Set `VITE_FIREBASE_*` values in `dashboard/.env`.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="app">
      {!isEmbedded && (
        <header className="topbar">
          <div className="brand" style={{ flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Link className="brand-logo-link" to="/" aria-label="Go to landing page" style={{ display: 'flex', alignItems: 'center' }}>
                  <img className="brand-logo" src={resolvedTheme === "dark" ? "/logo-dark.svg" : "/logo.svg"} alt="Metric Mango" width="192" height="64" />
                </Link>
                {overview?.plan === 'active' && !accessState.trialExpired && !locked ? (
                  <span style={{ background: 'linear-gradient(135deg, #F5C518 0%, #d6a800 100%)', color: '#161616', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '800', letterSpacing: '0.05em', height: 'fit-content', boxShadow: '0 2px 8px rgba(245, 197, 24, 0.25)' }}>
                    PRO
                  </span>
                ) : null}
              </div>
              <p>Predict demand. Prevent stockouts. Grow profit.</p>
            </div>
          </div>
          <div className="topbar-right">
            <nav className="nav">
              <NavLink to="/dashboard" end className={({ isActive }) => (isActive ? "active" : "")}>Overview</NavLink>
              <NavLink to="/dashboard/products" className={({ isActive }) => (isActive ? "active" : "")}>Products</NavLink>
              <NavLink to="/dashboard/forecast" className={({ isActive }) => (isActive ? "active" : "")}>Forecast</NavLink>
              <NavLink to="/dashboard/pricing" className={({ isActive }) => (isActive ? "active" : "")}>Pricing</NavLink>
            </nav>
            <div className="session-meta">
              <span className="session-email">{user?.email || "Signed in"}</span>
              {accessState.trialExpired || locked ? <span className="lock-pill">Locked</span> : null}
              <button
                type="button"
                className="theme-toggle-btn theme-toggle-icon-btn"
                onClick={onToggleTheme}
                title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                aria-label={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {resolvedTheme === "dark" ? <FiMoon aria-hidden="true" /> : <FiSun aria-hidden="true" />}
              </button>
              <Button type="button" variant="secondary" onClick={handleLogout}>Logout</Button>
            </div>
          </div>
        </header>
      )}
      <main className="main">
        {sessionExpired ? (
          <div className="upgrade-banner" role="alert">
            <span>Your session has expired. Please sign in again.</span>
          </div>
        ) : null}
        {onboardingRequired && !location.pathname.startsWith("/dashboard/onboarding") ? (
          <div className="upgrade-banner" role="status">
            <span>Complete onboarding to continue.</span>
            <Button type="button" variant="primary" onClick={() => navigate("/dashboard/onboarding")}>Continue</Button>
          </div>
        ) : null}
        <Outlet />
      </main>
    </div>
  );
}

function OnboardingPage() {
  const { finishOnboarding } = useAuth();
  const [shopName, setShopName] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showDisconnect, setShowDisconnect] = useState(false);

  async function handleConnect(event) {
    event.preventDefault();
    const normalizedShopName = String(shopName || "").trim().toLowerCase();
    setLoading(true);
    setError("");
    setSuccess("");

    if (!isValidShopifyStoreName(normalizedShopName)) {
      setLoading(false);
      setError("Enter a valid Shopify store name using letters, numbers, and hyphens only.");
      return;
    }

    try {
      const response = await connectShopifyStore(normalizedShopName);
      const redirectUrl = String(response?.redirectUrl || response?.installUrl || "").trim();
      if (!redirectUrl) {
        setSuccess(response?.message || "Shopify connection started.");
        return;
      }
      window.location.assign(redirectUrl);
    } catch (requestError) {
      const message = requestError?.message || requestError?.data?.error || "Unable to connect Shopify right now.";
      setError(message);
      setShowDisconnect(message.toLowerCase().includes("already"));
    } finally {
      setLoading(false);
    }
  }

  async function handleRefreshStatus() {
    setStatusLoading(true);
    setError("");
    try {
      const nextStatus = await getOnboardingStatus();
      setStatus(nextStatus);
    } catch {
      setError("Unable to load onboarding status.");
    } finally {
      setStatusLoading(false);
    }
  }

  async function handleFinish() {
    setLoading(true);
    setError("");
    try {
      await finishOnboarding();
      setSuccess("Onboarding completed. Dashboard unlocked.");
    } catch {
      setError("Unable to complete onboarding right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <section className="card">
        <h2>Complete Onboarding</h2>
        <p className="auth-subtitle">Connect your Shopify store, then continue to dashboard.</p>
        <form onSubmit={handleConnect} className="auth-form">
          <label htmlFor="shop-name">Shopify store name</label>
          <input
            id="shop-name"
            type="text"
            value={shopName}
            onChange={event => setShopName(event.target.value)}
            placeholder="example-store"
            required
          />
          <Button type="submit" variant="primary" loading={loading} loadingText="Connecting...">
            Connect Shopify Store
          </Button>
        </form>
        <div className="landing-actions">
          <Button type="button" variant="secondary" onClick={handleRefreshStatus} disabled={loading} loading={statusLoading} loadingText="Checking...">
            Check Status
          </Button>
          <Button type="button" variant="primary" onClick={handleFinish} disabled={statusLoading} loading={loading} loadingText="Working...">
            Complete Onboarding
          </Button>
        </div>
        {showDisconnect ? (
          <div className="onboarding-note">
            <div>You already have a store connected.</div>
            <Button
              type="button"
              variant="danger"
              loading={loading}
              loadingText="Disconnecting..."
              onClick={async () => {
                setError("");
                setSuccess("");
                try {
                  setLoading(true);
                  const result = await disconnectShopifyStore();
                  setSuccess(result?.message || "Disconnected current store. You can connect a new one now.");
                  setShowDisconnect(false);
                } catch (disconnectError) {
                  setError(disconnectError?.message || "Unable to disconnect right now.");
                } finally {
                  setLoading(false);
                }
              }}
            >
              Disconnect current store
            </Button>
          </div>
        ) : null}
        {status ? (
          <div className="onboarding-note">
            <div>Store connected: {status.storeConnected ? "Yes" : "No"}</div>
            <div>Orders syncing: {status.ordersSyncing ? "Yes" : "No"}</div>
            <div>Trial days left: {Number.isFinite(status.trialDaysLeft) ? status.trialDaysLeft : 0}</div>
          </div>
        ) : null}
        {error ? <div className="auth-error">{error}</div> : null}
        {success ? <div className="auth-success">{success}</div> : null}
      </section>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const forgotMode = new URLSearchParams(location.search).get("forgot") === "1";
  const [themeMode, setThemeMode] = useState(getInitialThemeMode);

  React.useEffect(() => {
    const root = document.documentElement;
    const resolved = resolveThemeMode(themeMode);
    root.setAttribute("data-theme", resolved);
    window.localStorage.setItem(THEME_MODE_KEY, themeMode);
  }, [themeMode]);

  return (
    <Routes>
      <Route path="/" element={<LandingPage themeMode={themeMode} onToggleTheme={() => setThemeMode(current => nextThemeMode(current))} />} />
      <Route path="/signin" element={<PublicOnlyRoute><AuthPage mode={forgotMode ? "forgot" : "signin"} /></PublicOnlyRoute>} />
      <Route path="/signup" element={<PublicOnlyRoute><AuthPage mode="signup" /></PublicOnlyRoute>} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout themeMode={themeMode} onToggleTheme={() => setThemeMode(current => nextThemeMode(current))} />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="forecast" element={<ForecastPage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="payment/:storeType" element={<PaymentPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
      </Route>
      <Route path="/privacy-policy" element={
        <PublicOnlyRoute>
          <div className="lp-shell">
            <header className="topbar">
              <div className="topbar-left">
                <Link to="/" className="brand brand-badge">
                  <img src="/logo.svg" alt="Metric Mango Logo" className="brand-logo" width="28" height="28" />
                  <span className="brand-name">Metric Mango</span>
                </Link>
              </div>
            </header>
            <PrivacyPolicy />
          </div>
        </PublicOnlyRoute>
      } />
      <Route path="/terms-of-service" element={
        <PublicOnlyRoute>
          <div className="lp-shell">
            <header className="topbar">
              <div className="topbar-left">
                <Link to="/" className="brand brand-badge">
                  <img src="/logo.svg" alt="Metric Mango Logo" className="brand-logo" width="28" height="28" />
                  <span className="brand-name">Metric Mango</span>
                </Link>
              </div>
            </header>
            <TermsOfService />
          </div>
        </PublicOnlyRoute>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
