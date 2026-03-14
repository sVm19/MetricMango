import React from "react";

export default function EmptyState({ title, description }) {
  const isLoading = typeof title === 'string' && title.toLowerCase().startsWith("loading");

  if (isLoading) {
    return (
      <div className="empty-state animate-pulse" role="status" aria-live="polite" style={{ width: '100%' }}>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="skeleton skeleton-title" style={{ width: '40%', marginBottom: '4px' }}></div>
          <div className="skeleton skeleton-text" style={{ width: '75%' }}></div>
          <div className="skeleton skeleton-text" style={{ width: '60%' }}></div>
        </div>
      </div>
    );
  }

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
