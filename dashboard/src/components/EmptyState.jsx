import React from "react";

export default function EmptyState({ title, description }) {
  return (
    <div className="empty-state" role="status" aria-live="polite">
      <div className="empty-icon" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="empty-state-content">
        <p className="empty-state-title">{title}</p>
        {description ? <p className="empty-state-body">{description}</p> : null}
      </div>
    </div>
  );
}
