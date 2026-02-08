import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [storeContextReady, setStoreContextReady] = useState(false);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [mappingError, setMappingError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [loading, setLoading] = useState(true);

  function detectCountryHint() {
    try {
      const locale = Intl.DateTimeFormat().resolvedOptions().locale || "";
      const parts = String(locale).split("-");
      return String(parts[parts.length - 1] || "").slice(0, 2).toUpperCase();
    } catch (error) {
      return "";
    }
  }

  async function resolveServerStoreMapping(nextUser) {
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
  }

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return undefined;
    }

    let unsubscribe = () => {};
    let isActive = true;

    async function initAuth() {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (error) {
        // Keep going with Firebase defaults if persistence setup fails.
      }

      if (!isActive) return;

      unsubscribe = onAuthStateChanged(auth, async nextUser => {
        if (!isActive) return;
        setUser(nextUser);

        try {
          await resolveServerStoreMapping(nextUser);
        } catch (error) {
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
  }, []);

  async function signIn(email, password) {
    if (!auth) throw new Error("Firebase auth is not configured.");
    setSessionExpired(false);
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await resolveServerStoreMapping(credential.user);
    return credential;
  }

  async function signUp(email, password) {
    if (!auth) throw new Error("Firebase auth is not configured.");
    setSessionExpired(false);
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    try {
      const idToken = await credential.user.getIdToken();
      await completeSignup(idToken);
      await resolveServerStoreMapping(credential.user);
      return credential;
    } catch (error) {
      await signOut(auth);
      const signupFinalizeError = new Error("Unable to finish account setup right now. Please try again.");
      signupFinalizeError.code = "app/signup-initialization-failed";
      throw signupFinalizeError;
    }
  }

  async function logout() {
    if (!auth) return;
    setUser(null);
    setStoreContextReady(false);
    setOnboardingRequired(false);
    setMappingError("");
    // Legacy cleanup from old client-side mapping implementation.
    localStorage.removeItem("metric-mango.user-store-map");
    await signOut(auth);
  }

  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      setSessionExpired(true);
      logout().catch(error => {
        // Avoid silent failures during forced logout flows.
        console.warn("Forced logout failed after unauthorized response", error);
      });
    });
    return unsubscribe;
  }, []);

  async function requestPasswordReset(email) {
    if (!auth) throw new Error("Firebase auth is not configured.");
    return sendPasswordResetEmail(auth, email);
  }

  async function finishOnboarding() {
    await completeOnboarding();
    setOnboardingRequired(false);
  }

  const value = useMemo(
    () => ({
      user,
      storeContextReady,
      onboardingRequired,
      mappingError,
      sessionExpired,
      loading,
      isFirebaseConfigured,
      signIn,
      signUp,
      requestPasswordReset,
      finishOnboarding,
      logout
    }),
    [loading, mappingError, onboardingRequired, sessionExpired, storeContextReady, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
