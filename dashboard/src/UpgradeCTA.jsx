function UpgradeCTA({
  onUpgrade,
  loading = false,
  disabled = false,
  priceText = "$9 / month",
  ctaText = "Start 7-day free trial"
}) {
  return (
    <div className="upgrade-cta">
      <div className="upgrade-cta-title">Metric Mango Pro</div>
      <div className="upgrade-cta-subtitle">Everything you need. Nothing you don&apos;t.</div>
      <div className="upgrade-cta-price">{priceText}</div>
      <div className="upgrade-cta-trial">7-day free trial</div>
      <button
        className="cta primary"
        type="button"
        onClick={onUpgrade}
        disabled={loading || disabled}
      >
        {loading ? "Opening checkout..." : ctaText}
      </button>
      <div className="upgrade-trust-list">
        <span>Cancel anytime</span>
        <span>No hidden charges</span>
        <span>Upgrade only if you love it</span>
      </div>
      <div className="upgrade-cta-note">No credit card required for trial</div>
      <div className="upgrade-cta-brand-note">Built for small ecommerce &amp; D2C brands</div>
      <div className="upgrade-features">
        <div className="upgrade-features-title">All features included</div>
        <ul className="upgrade-features-list">
          <li><span aria-hidden="true">✓</span>Sales analytics dashboard</li>
          <li><span aria-hidden="true">✓</span>Sales forecasting (7/14/30 days)</li>
          <li><span aria-hidden="true">✓</span>Restock suggestions</li>
          <li><span aria-hidden="true">✓</span>Email alerts</li>
          <li><span aria-hidden="true">✓</span>CSV exports</li>
        </ul>
      </div>
    </div>
  );
}

export default UpgradeCTA;
