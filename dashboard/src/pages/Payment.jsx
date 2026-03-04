import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    IconBrandPaypal
} from "@tabler/icons-react";
import { getBillingUpgradeUrl, getPayPalCheckoutUrl } from "../api.js";

export default function PaymentPage() {
    const { storeType } = useParams();
    const navigate = useNavigate();

    // Separate loading/error states for each payment provider.
    const [loading, setLoading] = useState("");
    const [error, setError] = useState("");

    const isIndia = storeType === "india";
    const storeLabel = isIndia ? "India Store" : "Global Store";
    const amount = isIndia ? "₹499/month" : "$9/month";
    const planDesc = isIndia ? "For merchants billed in INR." : "For non-India merchants billed in USD.";

    // --- Primary checkout (Lemon Squeezy for global, Razorpay for India) ---
    async function handlePrimaryPay() {
        setLoading("primary");
        setError("");
        try {
            const redirectUrl = `${window.location.origin}/dashboard`;
            const data = await getBillingUpgradeUrl(redirectUrl);
            const checkoutUrl = data?.checkoutUrl;
            if (checkoutUrl) {
                window.location.href = checkoutUrl;
            } else {
                setError("Could not get checkout link. Please try again.");
                setLoading("");
            }
        } catch (err) {
            const message = err?.data?.error || err?.message || "Checkout failed. Please try again.";
            setError(message);
            setLoading("");
        }
    }

    // --- PayPal checkout (alternative for global users) ---
    async function handlePayPalPay() {
        setLoading("paypal");
        setError("");
        try {
            const redirectUrl = `${window.location.origin}/dashboard`;
            const data = await getPayPalCheckoutUrl(redirectUrl);
            const checkoutUrl = data?.checkoutUrl;
            if (checkoutUrl) {
                window.location.href = checkoutUrl;
            } else {
                setError("Could not get PayPal checkout link. Please try again.");
                setLoading("");
            }
        } catch (err) {
            const message = err?.data?.error || err?.message || "PayPal checkout failed. Please try again.";
            setError(message);
            setLoading("");
        }
    }

    const isLoading = Boolean(loading);

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
                    {error && (
                        <p className="mm-fade-up" style={{ color: 'var(--mm-danger, #ef4444)', marginTop: '0.75rem', fontSize: '0.95rem' }}>
                            {error}
                        </p>
                    )}
                    <div className="mm-hero-ctas mm-fade-up mm-delay-5" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>

                        {/* Primary checkout button (Lemon Squeezy / Razorpay) */}
                        <button
                            type="button"
                            className="mm-cta mm-cta-primary"
                            disabled={isLoading}
                            onClick={handlePrimaryPay}
                            style={{ width: '100%', maxWidth: '320px' }}
                        >
                            {loading === "primary" ? "Redirecting…" : `Pay ${amount}`}
                        </button>

                        {/* PayPal checkout button — only for global (non-India) stores */}
                        {!isIndia && (
                            <button
                                type="button"
                                className="mm-cta mm-cta-secondary"
                                disabled={isLoading}
                                onClick={handlePayPalPay}
                                style={{
                                    width: '100%',
                                    maxWidth: '320px',
                                    background: 'transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem'
                                }}
                            >
                                {loading === "paypal" ? "Redirecting to PayPal…" : (
                                    <>
                                        <IconBrandPaypal size={20} />
                                        Subscribe with PayPal
                                    </>
                                )}
                            </button>
                        )}

                        <button
                            type="button"
                            className="mm-cta mm-cta-secondary"
                            onClick={() => navigate(-1)}
                            style={{ background: 'transparent', width: '100%', maxWidth: '320px' }}
                            disabled={isLoading}
                        >
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
