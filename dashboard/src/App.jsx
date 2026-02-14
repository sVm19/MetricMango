import React, { useState } from "react";
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Button from "./components/Button.jsx";
import DashboardPage from "./pages/Dashboard.jsx";
import ProductsPage from "./pages/Products.jsx";
import ForecastPage from "./pages/Forecast.jsx";
import PricingPage from "./pages/Pricing.jsx";
import { useAuth } from "./auth/AuthContext.jsx";
import { useAccess } from "./access/AccessContext.jsx";
import { connectShopifyStore, disconnectShopifyStore, getOnboardingStatus } from "./api.js";

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

function LandingPage() {
  return (
    <div className="lp-shell">
      <div className="lp-glow" aria-hidden="true" />
      <main className="lp-container">
        <section className="lp-hero">
          <div className="lp-pill">Metric Mango for Shopify</div>
          <h1>Predict Sales. Prevent Stockouts.</h1>
          <p>Simple sales analytics for Shopify stores.</p>
          <div className="lp-actions">
            <Button as={Link} to="/signup" variant="primary">Start Free 7-Day Trial</Button>
            <Button as={Link} to="/signin" variant="secondary">Connect Your Store</Button>
          </div>
        </section>

        <section className="lp-section">
          <h2>Problem</h2>
          <p>
            Most store owners discover demand shifts too late. Inventory runs out, ad spend gets wasted, and revenue drops before teams can react.
          </p>
        </section>

        <section className="lp-section">
          <h2>Solution</h2>
          <p>
            Metric Mango gives a clear daily command center for sales, demand forecasts, and restock signals so you can move before stockouts hit.
          </p>
        </section>

        <section className="lp-section">
          <h2>Features</h2>
          <div className="lp-features">
            <article className="lp-feature-card">
              <h3>Forecasting</h3>
              <p>See demand trends across 7, 14, and 30 days with actionable projections.</p>
            </article>
            <article className="lp-feature-card">
              <h3>Restock Alerts</h3>
              <p>Know exactly which products need attention before they become a lost-sale risk.</p>
            </article>
            <article className="lp-feature-card">
              <h3>Store Analytics</h3>
              <p>Track revenue and order movement in one focused dashboard your team can trust.</p>
            </article>
          </div>
        </section>

        <section className="lp-section lp-pricing">
          <h2>Pricing</h2>
          <p>One plan. All features. No tiers.</p>
          <div className="lp-price">₹499 / $9<span> per month</span></div>
        </section>

        <section className="lp-section lp-final-cta">
          <h2>Ready to run a smarter store?</h2>
          <p>Launch in minutes and get the clarity your team needs to scale inventory decisions.</p>
          <div className="lp-actions">
            <Button as={Link} to="/signup" variant="primary">Start Free 7-Day Trial</Button>
            <Button as={Link} to="/signin" variant="secondary">Connect Your Store</Button>
          </div>
        </section>
      </main>
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
          <img className="brand-logo" src="/logo.svg" alt="Metric Mango" />
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
            <Button type="button" variant="secondary" onClick={handleLogout}>Logout</Button>
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
