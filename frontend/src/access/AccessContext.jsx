import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { ApiError, getOverview, onTrialExpired } from "../api.js";

const AccessContext = createContext(null);

function isPlanRestricted(error) {
  if (!(error instanceof ApiError)) return false;
  if ([401, 402, 403].includes(error.status)) return true;

  const raw = String(error.data?.error || error.message || "").toLowerCase();
  return raw.includes("trial expired") || raw.includes("inactive subscription") || raw.includes("plan");
}

export function AccessProvider({ children }) {
  const { user, storeContextReady, onboardingRequired, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    if (authLoading || !user || !storeContextReady || onboardingRequired) {
      setLoading(false);
      setOverview(null);
      setLocked(false);
      setError("");
      return () => {
        active = false;
      };
    }

    async function loadAccessState() {
      try {
        setLoading(true);
        setError("");
        setLocked(false);
        const data = await getOverview();
        if (!active) return;
        setOverview(data);
      } catch (err) {
        if (!active) return;
        setOverview(null);
        if (isPlanRestricted(err)) {
          setLocked(true);
          setError("");
        } else {
          setLocked(false);
          setError("Unable to load access status right now.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadAccessState();
    return () => {
      active = false;
    };
  }, [authLoading, onboardingRequired, storeContextReady, user]);

  useEffect(() => {
    const unsubscribe = onTrialExpired(() => {
      setLocked(true);
      setError("");
      setOverview(current => {
        if (!current) return current;
        return {
          ...current,
          plan: "inactive",
          trialDaysLeft: 0,
          trial: {
            ...(current.trial || {}),
            active: false
          }
        };
      });
    });

    return unsubscribe;
  }, []);

  const isAuthenticated = Boolean(user);
  const trialDaysLeft = typeof overview?.trialDaysLeft === "number" ? overview.trialDaysLeft : null;
  const trialExpired = locked || (isAuthenticated && overview?.plan === "inactive");
  const value = useMemo(
    () => ({
      accessState: {
        isAuthenticated,
        trialExpired,
        trialDaysLeft
      },
      isAuthenticated,
      trialExpired,
      trialDaysLeft,
      loading,
      overview,
      locked,
      error
    }),
    [error, isAuthenticated, loading, locked, overview, trialDaysLeft, trialExpired]
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const context = useContext(AccessContext);
  if (!context) {
    throw new Error("useAccess must be used inside AccessProvider.");
  }
  return context;
}
