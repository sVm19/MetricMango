import React from "react";
import { useParams, useNavigate } from "react-router-dom";

export default function PaymentPage() {
    const { storeType } = useParams();
    const navigate = useNavigate();

    const isIndia = storeType === "india";
    const storeLabel = isIndia ? "India Store" : "Global Store";
    const amount = isIndia ? "₹499/month" : "$9/month";
    const planDesc = isIndia ? "For merchants billed in INR." : "For non-India merchants billed in USD.";

    return (
        <div className="mm-landing-shell" style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
            <main className="mm-landing-main" style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                <section className="mm-hero" id="top" style={{ width: '100%', paddingTop: '0', paddingBottom: '0' }}>
                    <div className="mm-hero-glow" aria-hidden="true" />
                    <span className="mm-hero-badge mm-fade-up mm-delay-1">Secure Checkout</span>
                    <h1 className="mm-display mm-fade-up mm-delay-2">Complete your subscription.</h1>
                    <p className="mm-fade-up mm-delay-3">
                        You are subscribing your {storeLabel} on the standard plan at {amount}. {planDesc}
                    </p>
                    <div className="mm-feature-pills mm-fade-up mm-delay-4">
                        <span>7-day free trial</span>
                        <span>Cancel anytime</span>
                        <span>Secure checkout</span>
                    </div>
                    <div className="mm-hero-ctas mm-fade-up mm-delay-5" style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                        <button type="button" className="mm-cta mm-cta-primary" onClick={() => navigate("/dashboard", { replace: true })}>
                            Pay {amount}
                        </button>
                        <button type="button" className="mm-cta mm-cta-secondary" onClick={() => navigate(-1)} style={{ background: 'transparent' }}>
                            Go Back
                        </button>
                    </div>
                    <p className="mm-trust-whisper mm-fade-up mm-delay-6">
                        No hidden fees. Works with any Shopify plan.
                    </p>
                </section>
            </main>
        </div>
    );
}
