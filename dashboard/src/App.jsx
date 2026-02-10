import React, { useState } from "react";
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import DashboardPage from "./pages/Dashboard.jsx";
import ProductsPage from "./pages/Products.jsx";
import ForecastPage from "./pages/Forecast.jsx";
import PricingPage from "./pages/Pricing.jsx";
import { useAuth } from "./auth/AuthContext.jsx";
import { useAccess } from "./access/AccessContext.jsx";
import { connectShopifyStore, getOnboardingStatus } from "./api.js";

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

function LandingPage() {
  return (
    <div className="landing-shell">
      <section className="landing-hero">
        <div className="hero-pill">Metric Mango</div>
        <h1>One dashboard for ecommerce growth</h1>
        <p>Track sales, forecast demand, and restock smarter. One plan. All features.</p>
        <div className="landing-actions">
          <Link className="auth-btn auth-btn-primary" to="/signup">Start Free Trial</Link>
          <Link className="auth-btn auth-btn-ghost" to="/signin">Sign In</Link>
        </div>
      </section>
    </div>
  );
}

function AuthPage({ mode }) {
  const navigate = useNavigate();
  const { signIn, signUp, requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={6}
                required
              />
            </>
          ) : null}

          {error ? <div className="auth-error">{error}</div> : null}
          {success ? <div className="auth-success">{success}</div> : null}
          <button type="submit" className="auth-btn auth-btn-primary" disabled={submitting}>
            {submitting ? "Please wait..." : mode === "signup" ? "Sign up" : mode === "forgot" ? "Send reset email" : "Sign in"}
          </button>
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

function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, sessionExpired, isFirebaseConfigured, onboardingRequired } = useAuth();
  const { accessState, locked } = useAccess();

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
      <header className="topbar">
        <div className="brand">
          <h1>Metric Mango</h1>
          <p>Built for small ecommerce teams.</p>
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
            <button type="button" className="auth-btn auth-btn-primary" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </header>
      <main className="main">
        {sessionExpired ? (
          <div className="upgrade-banner" role="alert">
            <span>Your session has expired. Please sign in again.</span>
          </div>
        ) : null}
        {onboardingRequired && !location.pathname.startsWith("/dashboard/onboarding") ? (
          <div className="upgrade-banner" role="status">
            <span>Complete onboarding to continue.</span>
            <button type="button" className="upgrade-banner-btn" onClick={() => navigate("/dashboard/onboarding")}>Continue</button>
          </div>
        ) : null}
        <Outlet />
      </main>
    </div>
  );
}

function OnboardingPage() {
  const { finishOnboarding } = useAuth();
  const [shopUrl, setShopUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleConnect(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const response = await connectShopifyStore(shopUrl.trim());
      setSuccess(response?.message || "Shopify connection started.");
      if (response?.installUrl) {
        window.open(response.installUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      setError("Unable to connect Shopify right now.");
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
          <label htmlFor="shop-url">Shopify URL</label>
          <input
            id="shop-url"
            type="text"
            value={shopUrl}
            onChange={event => setShopUrl(event.target.value)}
            placeholder="your-shop.myshopify.com"
            required
          />
          <button type="submit" className="auth-btn auth-btn-primary" disabled={loading}>
            {loading ? "Connecting..." : "Connect Shopify"}
          </button>
        </form>
        <div className="landing-actions">
          <button type="button" className="auth-btn auth-btn-ghost" onClick={handleRefreshStatus} disabled={statusLoading}>
            {statusLoading ? "Checking..." : "Check Status"}
          </button>
          <button type="button" className="auth-btn auth-btn-primary" onClick={handleFinish} disabled={loading}>
            Complete Onboarding
          </button>
        </div>
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

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/signin" element={<PublicOnlyRoute><AuthPage mode={forgotMode ? "forgot" : "signin"} /></PublicOnlyRoute>} />
      <Route path="/signup" element={<PublicOnlyRoute><AuthPage mode="signup" /></PublicOnlyRoute>} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="forecast" element={<ForecastPage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
