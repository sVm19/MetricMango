import React, { useEffect } from 'react';

const PrivacyPolicy = () => {
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <div className="mm-legal-page">
            <div className="mm-legal-container">
                <h1>Privacy Policy</h1>
                <p className="mm-legal-updated">Last Updated: March 2026</p>

                <section>
                    <h2>1. Introduction</h2>
                    <p>
                        Welcome to Metric Mango ("we," "our," or "us"). We respect your privacy and are committed to protecting your personal data.
                        This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website, application,
                        and services (collectively, the "Service"), particularly in connection with your Shopify store.
                    </p>
                </section>

                <section>
                    <h2>2. Information We Collect</h2>
                    <p>We may collect information about you in a variety of ways. The information we may collect includes:</p>
                    <ul>
                        <li><strong>Personal Data:</strong> Personally identifiable information, such as your name, email address, and demographic information that you voluntarily give to us when you register for the Service.</li>
                        <li><strong>Shopify Store Data:</strong> When you connect your Shopify store, we access data required to provide our inventory forecasting and restock suggestion services. This includes product details (SKUs, inventory levels), order history, and sales data. We <strong>do not</strong> collect or store your customers' sensitive identifiable information (like full addresses or credit card details) beyond what is strictly necessary for aggregate sales volume forecasting.</li>
                        <li><strong>Usage Data:</strong> Information about how you use our Service, such as your IP address, browser type, operating system, access times, and the pages you view directly before and after accessing the Service.</li>
                    </ul>
                </section>

                <section>
                    <h2>3. How We Use Your Information</h2>
                    <p>We use the information we collect to:</p>
                    <ul>
                        <li>Provide, operate, and maintain the Service (including generating inventory forecasts).</li>
                        <li>Improve, personalize, and expand the Service.</li>
                        <li>Understand and analyze how you use the Service.</li>
                        <li>Communicate with you, either directly or through one of our partners, including for customer service, to provide you with updates and other information relating to the Service, and for marketing and promotional purposes (such as our email drip campaigns).</li>
                        <li>Process your transactions and manage your subscriptions.</li>
                        <li>Find and prevent fraud.</li>
                    </ul>
                </section>

                <section>
                    <h2>4. Disclosure of Your Information</h2>
                    <p>We may share information we have collected about you in certain situations. Your information may be disclosed as follows:</p>
                    <ul>
                        <li><strong>By Law or to Protect Rights:</strong> If we believe the release of information about you is necessary to respond to legal process, to investigate or remedy potential violations of our policies, or to protect the rights, property, and safety of others.</li>
                        <li><strong>Third-Party Service Providers:</strong> We may share your information with third parties that perform services for us or on our behalf, including payment processing (e.g., Razorpay, Lemon Squeezy, PayPal), data analysis, email delivery (e.g., Resend), hosting services, and customer service.</li>
                        <li><strong>Business Transfers:</strong> We may share or transfer your information in connection with, or during negotiations of, any merger, sale of company assets, financing, or acquisition of all or a portion of our business to another company.</li>
                    </ul>
                    <p>We explicitly do not sell your personal or store data to third parties.</p>
                </section>

                <section>
                    <h2>5. Data Retention and Security</h2>
                    <p>
                        We use administrative, technical, and physical security measures (including secure Firebase infrastructure) to help protect your personal information and store data.
                        We retain your information only as long as your account is active or as needed to provide you the Service. If you choose to disconnect your Shopify store and close your account, we will delete your synced store data within 48 hours in accordance with our data retention policies.
                    </p>
                </section>

                <section>
                    <h2>6. Your Data Rights</h2>
                    <p>Depending on your location, you may have the right to request access to the personal data we hold about you, to request that your personal data be corrected or deleted, and to request that we restrict the processing of your personal data. To exercise these rights, please contact us at the email address provided below.</p>
                </section>

                <section>
                    <h2>7. Contact Us</h2>
                    <p>If you have questions or comments about this Privacy Policy, please contact us at:</p>
                    <p>Email: <a href="mailto:team@metricmango.store">team@metricmango.store</a></p>
                </section>
            </div>
        </div>
    );
};

export default PrivacyPolicy;
