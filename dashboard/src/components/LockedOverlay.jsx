import React from "react";

export default function LockedOverlay() {
  return (
    <div className="locked-overlay" role="status" aria-live="polite">
      <div className="locked-overlay-card">
        <div className="locked-overlay-title">Upgrade to Pro</div>
        <div className="locked-overlay-subtitle">
          One plan. All features. No tiers. No upsells.
        </div>
      </div>
    </div>
  );
}
