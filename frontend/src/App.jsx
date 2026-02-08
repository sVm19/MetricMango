import React, { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import Products from "./pages/Products.jsx";
import Forecast from "./pages/Forecast.jsx";
import Pricing from "./pages/Pricing.jsx";
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
  if (code === "app/signup-initialization-failed") return "We created your account, but setup did not finish. Please try signing up again.";
  return "Unable to continue right now. Please try again.";
}

function mapResetError(err) {
  const code = err?.code || "";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/user-not-found") return "No account found for that email address.";
  if (code === "auth/missing-email") return "Email is required.";
  return "Unable to send reset email right now. Please try again.";
}

function AuthDialog({ mode, onClose, onSwitchMode, onForgotPassword, onSuccess, onSignInSuccess }) {
  const { signIn, signUp, requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    const normalizedEmail = email.trim().toLowerCase();

    if (mode === "forgot") {
      if (!isValidEmail(normalizedEmail)) {
        setSubmitting(false);
        setError("Enter a valid email address.");
        return;
      }
    }

    if (mode === "signup") {
      if (!isValidEmail(normalizedEmail)) {
        setSubmitting(false);
        setError("Enter a valid email address.");
        return;
      }
      if (password.length < 6) {
        setSubmitting(false);
        setError("Password must be at least 6 characters.");
        return;
      }
    }

    try {
      if (mode === "forgot") {
        await requestPasswordReset(normalizedEmail);
        setSuccess("Password reset email sent");
        return;
      } else if (mode === "signup") {
        await signUp(normalizedEmail, password);
        setSuccess("Account created. Your 7-day free trial is now active.");
        onSuccess("Welcome! Your 7-day free trial has started.");
        onSignInSuccess("signup");
      } else {
        await signIn(normalizedEmail, password);
        onSuccess("Signed in successfully.");
        onSignInSuccess("signin");
      }
      onClose();
    } catch (err) {
      if (mode === "forgot") {
        setError(mapResetError(err));
      } else {
        setError(mapAuthError(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-modal-backdrop" role="dialog" aria-modal="true">
      <section className="auth-card auth-modal">
        <h2>{mode === "signup" ? "Create account" : mode === "forgot" ? "Forgot password" : "Sign in"}</h2>
        <p className="auth-subtitle">
          {mode === "signup"
            ? "Start your 7-day free trial. No credit card required."
            : mode === "forgot"
              ? "Enter your email and we will send a reset link."
              : "Welcome back. Sign in to continue."}
        </p>
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
          <div className="auth-form-actions">
            <button type="button" className="auth-btn auth-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="auth-btn auth-btn-primary" disabled={submitting}>
              {submitting
                ? "Please wait..."
                : mode === "signup"
                  ? "Sign up"
                  : mode === "forgot"
                    ? "Send reset email"
                    : "Sign in"}
            </button>
          </div>
        </form>
        {mode === "forgot" ? (
          <button type="button" className="auth-link" onClick={onForgotPassword}>
            Back to Sign in
          </button>
        ) : (
          <>
            <button type="button" className="auth-link" onClick={onSwitchMode}>
              {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Sign up"}
            </button>
            {mode === "signin" ? (
              <button type="button" className="auth-link" onClick={onForgotPassword}>
                Forgot your password?
              </button>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function AuthRequiredPage({ onSignIn }) {
  return (
    <div className="auth-shell">
      <section className="auth-card">
        <h2>Sign in required</h2>
        <p className="auth-subtitle">Sign in to access dashboard data for your store.</p>
        <button type="button" className="auth-btn auth-btn-primary" onClick={onSignIn}>
          Sign in
        </button>
      </section>
    </div>
  );
}

function OnboardingProgress({ step, total, title }) {
  return (
    <div className="onboarding-progress" role="status" aria-live="polite">
      <div className="onboarding-step">Step {step} of {total}</div>
      <div className="onboarding-title">{title}</div>
    </div>
  );
}

function OnboardingPage() {
  const [shopUrl, setShopUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const navigate = useNavigate();

  async function handleConnect(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const normalizedShopUrl = shopUrl.trim();
    if (!normalizedShopUrl) {
      setLoading(false);
      setError("Enter your Shopify store URL.");
      return;
    }

    try {
      const result = await connectShopifyStore(normalizedShopUrl);
      setSuccess("Store connected. Opening Shopify install in a new tab...");
      navigate("/onboarding/confirmation");
      if (result?.installUrl) {
        window.open(result.installUrl, "_blank", "noopener,noreferrer");
      }
    } catch (requestError) {
      const message = requestError?.data?.error || requestError?.message || "";
      if (String(message).toLowerCase().includes("myshopify")) {
        setError("Use your .myshopify.com URL (example: your-shop.myshopify.com).");
      } else {
        setError("Unable to connect Shopify right now. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <OnboardingProgress step={1} total={3} title="Connect Shopify" />
        <h2>Connect Shopify</h2>
        <p className="auth-subtitle">Add your Shopify URL to start syncing real orders.</p>
        <div className="onboarding-note">
          <div>Orders will sync automatically into your dashboard.</div>
          <div>Metric Mango will never modify Shopify data.</div>
        </div>
        <form onSubmit={handleConnect} className="auth-form">
          <label htmlFor="shop-url">Shopify store URL</label>
          <input
            id="shop-url"
            type="text"
            value={shopUrl}
            onChange={event => setShopUrl(event.target.value)}
            placeholder="your-shop.myshopify.com"
            required
          />
          {error ? <div className="auth-error">{error}</div> : null}
          {success ? <div className="auth-success">{success}</div> : null}
          <button type="submit" className="auth-btn auth-btn-primary" disabled={loading}>
            {loading ? "Connecting Shopify..." : "Connect Shopify"}
          </button>
        </form>
      </section>
    </div>
  );
}

function ChecklistItem({ checked, label }) {
  return (
    <div className={`checklist-item ${checked ? "done" : "pending"}`}>
      <span className="check-bullet" aria-hidden="true">{checked ? "✓" : "•"}</span>
      <span>{label}</span>
    </div>
  );
}

function OnboardingConfirmationPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError("");
        const data = await getOnboardingStatus();
        if (!active) return;
        setStatus(data);
      } catch (requestError) {
        if (!active) return;
        setError("Unable to load setup status. Please refresh.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  function handleContinue() {
    navigate("/onboarding/ready");
  }

  if (loading) {
    return (
      <div className="auth-shell">
        <section className="auth-card auth-loading-card">
          <div className="spinner" aria-label="Loading setup confirmation" />
          <p className="auth-subtitle">Checking setup status...</p>
        </section>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <OnboardingProgress step={2} total={3} title="Setup Confirmation" />
        <h2>Setup confirmed</h2>
        <p className="auth-subtitle">
          {status?.storeConnected
            ? "Your store is connected and ready."
            : "Store connection is still in progress. Continue after install is complete."}
        </p>
        <div className="onboarding-note">
          <ChecklistItem checked={Boolean(status?.checklist?.webhookActive)} label="Webhook active" />
          <ChecklistItem checked={Boolean(status?.checklist?.trialStarted)} label="Trial started" />
        </div>
        <div className="trial-days">Trial days left: {Number.isFinite(status?.trialDaysLeft) ? status.trialDaysLeft : 0}</div>
        {error ? <div className="auth-error">{error}</div> : null}
        <button type="button" className="auth-btn auth-btn-primary" onClick={handleContinue}>Continue</button>
      </section>
    </div>
  );
}

function OnboardingReadyPage() {
  const { finishOnboarding } = useAuth();
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");

  async function handleGoToDashboard() {
    setFinishing(true);
    setError("");
    try {
      await finishOnboarding();
    } catch (requestError) {
      setError("Unable to finish setup right now.");
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <OnboardingProgress step={3} total={3} title="Ready to Explore" />
        <h2>You&apos;re all set</h2>
        <p className="auth-subtitle">Your store is connected. Open the dashboard to see live insights.</p>
        {error ? <div className="auth-error">{error}</div> : null}
        <button type="button" className="auth-btn auth-btn-primary" disabled={finishing} onClick={handleGoToDashboard}>
          {finishing ? "Opening..." : "Go to Dashboard"}
        </button>
      </section>
    </div>
  );
}

function AuthLoadingPage() {
  return (
    <div className="auth-shell">
      <section className="auth-card auth-loading-card">
        <div className="spinner" aria-label="Loading authentication state" />
        <p className="auth-subtitle">Checking authentication state...</p>
      </section>
    </div>
  );
}

function ProtectedRoute({ authLoading, accessLoading, hasSession, children }) {
  if (authLoading || accessLoading) return <AuthLoadingPage />;
  if (!hasSession) return <Navigate to="/signin" replace />;
  return children;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, user, storeContextReady, onboardingRequired, mappingError, sessionExpired, isFirebaseConfigured, logout } = useAuth();
  const { loading: accessLoading, locked, accessState } = useAccess();
  const [authMode, setAuthMode] = useState(null);
  const [notice, setNotice] = useState("");
  const hasSession = accessState.isAuthenticated;
  const isOnboardingRoute = location.pathname.startsWith("/onboarding");

  async function handleLogout() {
    setAuthMode(null);
    setNotice("");
    await logout();
    navigate("/signin", { replace: true });
  }

  function openSignIn() {
    setAuthMode("signin");
    navigate("/signin");
  }

  function openSignUp() {
    setAuthMode("signup");
    navigate("/signin");
  }

  function openForgotPassword() {
    setAuthMode(current => (current === "forgot" ? "signin" : "forgot"));
    navigate("/signin");
  }

  useEffect(() => {
    if (!loading && !hasSession && location.pathname === "/signin" && !authMode) {
      setAuthMode("signin");
    }
  }, [authMode, hasSession, loading, location.pathname]);

  useEffect(() => {
    if (!loading && !hasSession && sessionExpired && location.pathname !== "/signin") {
      navigate("/signin", { replace: true });
    }
  }, [hasSession, loading, location.pathname, navigate, sessionExpired]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div>
            <h1>Metric Mango</h1>
            <p>Built for small ecommerce teams.</p>
          </div>
        </div>
        <div className="topbar-right">
          <nav className="nav">
            <NavLink className={({ isActive }) => (isActive ? "active" : "")} to="/">
              Dashboard
            </NavLink>
            <NavLink className={({ isActive }) => (isActive ? "active" : "")} to="/products">
              Products
            </NavLink>
            <NavLink className={({ isActive }) => (isActive ? "active" : "")} to="/forecast">
              Forecast
            </NavLink>
            <NavLink className={({ isActive }) => (isActive ? "active" : "")} to="/pricing">
              Pricing
            </NavLink>
          </nav>
          {hasSession ? (
            <div className="session-meta">
              <span className="session-email">{user.email || user.uid}</span>
              {accessState.trialExpired || locked ? <span className="lock-pill">Locked</span> : null}
              <button type="button" className="auth-btn auth-btn-primary" onClick={handleLogout}>
                Logout
              </button>
            </div>
          ) : (
            <div className="auth-actions">
              <button type="button" className="auth-btn auth-btn-ghost" onClick={openSignUp}>
                Sign up
              </button>
              <button type="button" className="auth-btn auth-btn-primary" onClick={openSignIn}>
                Sign in
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="main">
        {notice ? <div className="trial-banner">{notice}</div> : null}
        {hasSession && accessState.trialExpired && !isOnboardingRoute ? (
          <div className="upgrade-banner" role="status" aria-live="polite">
            <span>Your trial has ended. Upgrade now to unlock all features.</span>
            <button type="button" className="upgrade-banner-btn" onClick={() => navigate("/pricing")}>
              Upgrade
            </button>
          </div>
        ) : null}
        {!isFirebaseConfigured ? (
          <div className="auth-shell">
            <section className="auth-card">
              <h2>Firebase Auth Not Configured</h2>
              <p className="auth-subtitle">
                Set `VITE_FIREBASE_*` variables in `frontend/.env` to enable email/password login.
              </p>
            </section>
          </div>
        ) : hasSession && !storeContextReady ? (
          <div className="auth-shell">
            <section className="auth-card auth-loading-card">
              {!mappingError ? <div className="spinner" aria-label="Loading store mapping" /> : null}
              <p className="auth-subtitle">
                {mappingError || "Connecting your account to your store..."}
              </p>
              <button type="button" className="auth-btn auth-btn-ghost" onClick={handleLogout}>
                Logout
              </button>
            </section>
          </div>
        ) : (
          <Routes>
            <Route
              path="/signin"
              element={
                hasSession ? (
                  <Navigate to="/" replace />
                ) : (
                  <div className="page">
                    {sessionExpired ? (
                      <div className="upgrade-banner" role="alert">
                        <span>Your session has expired. Please sign in again.</span>
                      </div>
                    ) : null}
                    <AuthRequiredPage onSignIn={openSignIn} />
                  </div>
                )
              }
            />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute authLoading={loading} accessLoading={false} hasSession={hasSession}>
                  {onboardingRequired ? <OnboardingPage /> : <Navigate to="/" replace />}
                </ProtectedRoute>
              }
            />
            <Route
              path="/onboarding/confirmation"
              element={
                <ProtectedRoute authLoading={loading} accessLoading={false} hasSession={hasSession}>
                  {onboardingRequired ? <OnboardingConfirmationPage /> : <Navigate to="/" replace />}
                </ProtectedRoute>
              }
            />
            <Route
              path="/onboarding/ready"
              element={
                <ProtectedRoute authLoading={loading} accessLoading={false} hasSession={hasSession}>
                  {onboardingRequired ? <OnboardingReadyPage /> : <Navigate to="/" replace />}
                </ProtectedRoute>
              }
            />
            <Route
              path="/"
              element={
                <ProtectedRoute authLoading={loading} accessLoading={accessLoading} hasSession={hasSession}>
                  {onboardingRequired ? <Navigate to="/onboarding" replace /> : <Dashboard />}
                </ProtectedRoute>
              }
            />
            <Route
              path="/products"
              element={
                <ProtectedRoute authLoading={loading} accessLoading={accessLoading} hasSession={hasSession}>
                  {onboardingRequired ? <Navigate to="/onboarding" replace /> : <Products />}
                </ProtectedRoute>
              }
            />
            <Route
              path="/forecast"
              element={
                <ProtectedRoute authLoading={loading} accessLoading={accessLoading} hasSession={hasSession}>
                  {onboardingRequired ? <Navigate to="/onboarding" replace /> : <Forecast />}
                </ProtectedRoute>
              }
            />
            <Route
              path="/pricing"
              element={
                <ProtectedRoute authLoading={loading} accessLoading={accessLoading} hasSession={hasSession}>
                  <Pricing />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to={hasSession ? "/" : "/signin"} replace />} />
          </Routes>
        )}
      </main>

      {authMode && (!hasSession || location.pathname === "/signin") ? (
        <AuthDialog
          mode={authMode}
          onClose={() => setAuthMode(null)}
          onSwitchMode={() => setAuthMode(current => (current === "signin" ? "signup" : "signin"))}
          onForgotPassword={openForgotPassword}
          onSuccess={message => setNotice(message)}
          onSignInSuccess={(kind = "signin") => {
            navigate(kind === "signup" ? "/onboarding" : "/");
            setAuthMode(null);
          }}
        />
      ) : null}
    </div>
  );
}
