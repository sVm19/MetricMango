import React, { useEffect } from 'react';

const TermsOfService = () => {
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <div className="mm-legal-page">
            <div className="mm-legal-container">
                <h1>Terms of Service</h1>
                <p className="mm-legal-updated">Last Updated: March 2026</p>

                <section>
                    <h2>1. Agreement to Terms</h2>
                    <p>
                        By accessing or using Metric Mango ("the Service"), you agree to be bound by these Terms of Service.
                        If you disagree with any part of the terms, then you may not access the Service.
                    </p>
                </section>

                <section>
                    <h2>2. Description of Service</h2>
                    <p>
                        Metric Mango provides inventory forecasting, restock suggestions, and analytics tools for e-commerce merchants.
                        The Service connects to third-party platforms (like Shopify) to analyze your store data and generate actionable insights.
                    </p>
                </section>

                <section>
                    <h2>3. Account Registration</h2>
                    <p>
                        To use the Service, you must create an account. You must provide accurate and complete information and keep your account information updated.
                        You are responsible for maintaining the confidentiality of your account and password, and you are fully responsible for all activities that occur under your account.
                    </p>
                </section>

                <section>
                    <h2>4. Subscription and Billing</h2>
                    <p>
                        Some parts of the Service are billed on a subscription basis. You will be billed in advance on a recurring and periodic basis (such as monthly or annually).
                        At the end of each period, your subscription will automatically renew under the exact same conditions unless you cancel it or Metric Mango cancels it.
                    </p>
                    <p>
                        You may cancel your subscription renewal either through your online account management page or by contacting our customer support team.
                    </p>
                </section>

                <section>
                    <h2>5. Third-Party Services (Shopify Data)</h2>
                    <p>
                        The Service requires access to your data hosted by third parties (e.g., Shopify). By connecting your store, you grant us permission to access, read, and analyze your inventory, product, and sales data.
                        We do not claim ownership of this data. You retain full ownership, but grant us a license to use it strictly for providing the Service to you.
                    </p>
                </section>

                <section>
                    <h2>6. Limitation of Liability</h2>
                    <p>
                        In no event shall Metric Mango, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages,
                        including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from:
                    </p>
                    <ul>
                        <li>Your access to or use of or inability to access or use the Service;</li>
                        <li>Any conduct or content of any third party on the Service;</li>
                        <li>Stockouts, overstocking, or inventory mismanagement resulting from reliance on our forecasts (our suggestions are estimates based on historical data, not guarantees);</li>
                        <li>Unauthorized access, use or alteration of your transmissions or content.</li>
                    </ul>
                </section>

                <section>
                    <h2>7. Termination</h2>
                    <p>
                        We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
                        Upon termination, your right to use the Service will immediately cease.
                    </p>
                </section>

                <section>
                    <h2>8. Contact Us</h2>
                    <p>If you have any questions about these Terms, please contact us at:</p>
                    <p>Email: <a href="mailto:team@metricmango.store">team@metricmango.store</a></p>
                </section>
            </div>
        </div>
    );
};

export default TermsOfService;
