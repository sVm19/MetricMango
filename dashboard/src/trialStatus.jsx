import { createContext, useContext, useMemo, useState } from "react";

const TrialStatusContext = createContext(null);

export function TrialStatusProvider({ children }) {
  const [trialExpired, setTrialExpired] = useState(false);
  const [trialExpiredMessage, setTrialExpiredMessage] = useState("");

  const value = useMemo(() => ({
    trialExpired,
    setTrialExpired,
    trialExpiredMessage,
    setTrialExpiredMessage
  }), [trialExpired, trialExpiredMessage]);

  return (
    <TrialStatusContext.Provider value={value}>
      {children}
    </TrialStatusContext.Provider>
  );
}

export function useTrialStatus() {
  const context = useContext(TrialStatusContext);
  if (!context) {
    throw new Error("useTrialStatus must be used inside TrialStatusProvider");
  }
  return context;
}
