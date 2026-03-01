import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "../firebase.js";
import { bootstrapUserStore, completeOnboarding, completeSignup, onUnauthorized } from "../api.js";

const AuthContext = createContext(null);
const IS_DUMMY_MODE = ["1", "true", "yes", "on"].includes(
  String(import.meta.env.VITE_USE_DUMMY_DATA || "").trim().toLowerCase()
);
const DUMMY_EMAIL = "demo@metricmango.local";
const DUMMY_PASSWORD = "Demo@123456";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [storeContextReady, setStoreContextReady] = useState(false);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [mappingError, setMappingError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dummyLoggedIn, setDummyLoggedIn] = useState(false);

  const detectCountryHint = useCallback(() => {
    try {
      const locale = Intl.DateTimeFormat().resolvedOptions().locale || "";
      const parts = String(locale).split("-");
      return String(parts[parts.length - 1] || "").slice(0, 2).toUpperCase();
    } catch {
      return "";
    }
  }, []);

  const resolveServerStoreMapping = useCallback(async nextUser => {
    if (!nextUser) {
      setStoreContextReady(false);
      return;
    }

    const idToken = await nextUser.getIdToken();
    const session = await bootstrapUserStore(idToken, detectCountryHint());
    const mappedStoreId = String(session?.storeId || "").trim();
    if (!mappedStoreId) {
      throw new Error("Unable to resolve your store mapping.");
    }
    setOnboardingRequired(session?.onboardingCompleted === false);
    setMappingError("");
    setSessionExpired(false);
    setStoreContextReady(true);
  }, [detectCountryHint]);

  useEffect(() => {
    if (IS_DUMMY_MODE) {
      setLoading(false);
      setStoreContextReady(dummyLoggedIn);
      setOnboardingRequired(false);
      setMappingError("");
      setSessionExpired(false);
      setUser(dummyLoggedIn ? { uid: "demo-user", email: DUMMY_EMAIL } : null);
      return undefined;
    }

    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return undefined;
    }

    let unsubscribe = () => { };
    let isActive = true;

    async function initAuth() {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch {
        // Keep going with Firebase defaults if persistence setup fails.
      }

      if (!isActive) return;

      unsubscribe = onAuthStateChanged(auth, async nextUser => {
        if (!isActive) return;
        setUser(nextUser);

        try {
          await resolveServerStoreMapping(nextUser);
        } catch {
          setStoreContextReady(false);
          setOnboardingRequired(false);
          setMappingError("Unable to connect this account to a store.");
        } finally {
          setLoading(false);
        }
      });
    }

    initAuth();

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [dummyLoggedIn, resolveServerStoreMapping]);

  const signIn = useCallback(async (email, password) => {
    if (IS_DUMMY_MODE) {
      const normalizedEmail = String(email || "").trim().toLowerCase();
      const normalizedPassword = String(password || "");
      if (normalizedEmail !== DUMMY_EMAIL || normalizedPassword !== DUMMY_PASSWORD) {
        const invalidError = new Error("Invalid email or password.");
        invalidError.code = "auth/invalid-credential";
        throw invalidError;
      }
      setDummyLoggedIn(true);
      setSessionExpired(false);
      setStoreContextReady(true);
      setOnboardingRequired(false);
      setMappingError("");
      setUser({ uid: "demo-user", email: DUMMY_EMAIL });
      return { user: { uid: "demo-user", email: DUMMY_EMAIL } };
    }

    if (!auth) throw new Error("Firebase auth is not configured.");
    setSessionExpired(false);
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await resolveServerStoreMapping(credential.user);
    return credential;
  }, [resolveServerStoreMapping]);

  const signUp = useCallback(async (email, password) => {
    if (IS_DUMMY_MODE) {
      return signIn(email, password);
    }

    if (!auth) throw new Error("Firebase auth is not configured.");
    setSessionExpired(false);
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    try {
      const idToken = await credential.user.getIdToken();
      await completeSignup(idToken);
      await resolveServerStoreMapping(credential.user);
      return credential;
    } catch {
      await signOut(auth);
      const signupFinalizeError = new Error("Unable to finish account setup right now. Please try again.");
      signupFinalizeError.code = "app/signup-initialization-failed";
      throw signupFinalizeError;
    }
  }, [resolveServerStoreMapping, signIn]);

  const logout = useCallback(async () => {
    if (IS_DUMMY_MODE) {
      setDummyLoggedIn(false);
      setSessionExpired(false);
      setUser(null);
      setStoreContextReady(false);
      setOnboardingRequired(false);
      setMappingError("");
      return;
    }

    if (!auth) return;
    setUser(null);
    setStoreContextReady(false);
    setOnboardingRequired(false);
    setMappingError("");
    // Legacy cleanup from old client-side mapping implementation.
    localStorage.removeItem("metric-mango.user-store-map");
    await signOut(auth);
  }, []);

  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      setSessionExpired(true);
      logout().catch(() => { });
    });
    return unsubscribe;
  }, [logout]);

  const requestPasswordReset = useCallback(async email => {
    if (IS_DUMMY_MODE) {
      return Promise.resolve(email);
    }

    if (!auth) throw new Error("Firebase auth is not configured.");
    return sendPasswordResetEmail(auth, email);
  }, []);

  const finishOnboarding = useCallback(async () => {
    await completeOnboarding();
    setOnboardingRequired(false);
  }, []);

  const value = useMemo(
    () => ({
      user,
      storeContextReady,
      onboardingRequired,
      mappingError,
      sessionExpired,
      loading,
      isFirebaseConfigured: IS_DUMMY_MODE ? true : isFirebaseConfigured,
      signIn,
      signUp,
      requestPasswordReset,
      finishOnboarding,
      logout
    }),
    [
      finishOnboarding,
      loading,
      logout,
      mappingError,
      onboardingRequired,
      requestPasswordReset,
      sessionExpired,
      signIn,
      signUp,
      storeContextReady,
      user
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
