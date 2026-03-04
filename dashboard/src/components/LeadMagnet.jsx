import React, { useState } from 'react';
import { IconCheck, IconMail, IconBuildingStore } from '@tabler/icons-react';
import Button from './Button.jsx';
import { getApiBase } from '../api.js';

const LeadMagnet = () => {
    const [storeName, setStoreName] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!storeName || !email) {
            setError('Please provide both your store name and email address.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const response = await fetch(`${getApiBase()}/leads`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ storeName, email }),
            });

            if (!response.ok) {
                throw new Error('Failed to submit. Please try again later.');
            }

            setSuccess(true);
            setStoreName('');
            setEmail('');
        } catch (err) {
            setError(err.message || 'An error occurred.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <section className="mm-lead-magnet mm-success-state">
                <div className="mm-lead-magnet-content">
                    <div className="mm-success-icon">
                        <IconCheck size={48} color="#10B981" />
                    </div>
                    <h2>Check Your Inbox!</h2>
                    <p>We've sent your free Inventory Health Check guide directly to your email.</p>
                    <Button variant="primary" onClick={() => setSuccess(false)}>Analyze Another Store</Button>
                </div>
            </section>
        );
    }

    return (
        <section className="mm-lead-magnet" id="health-check">
            <div className="mm-lead-magnet-container">
                <div className="mm-lead-magnet-text">
                    <h2>Free Inventory Health Check</h2>
                    <p>
                        Wondering how much capital you have tied up in slow-moving stock? Or which products are at risk of a stockout?
                        Enter your Shopify store name and email below, and we'll send you a comprehensive guide on identifying your biggest inventory risks.
                    </p>
                </div>
                <form className="mm-lead-magnet-form" onSubmit={handleSubmit}>
                    <div className="mm-input-group">
                        <label htmlFor="storeName">Shopify Store Name</label>
                        <div className="mm-input-wrapper">
                            <IconBuildingStore className="mm-input-icon" size={20} />
                            <input
                                type="text"
                                id="storeName"
                                placeholder="yourstore.myshopify.com"
                                value={storeName}
                                onChange={(e) => setStoreName(e.target.value)}
                                disabled={loading}
                            />
                        </div>
                    </div>
                    <div className="mm-input-group">
                        <label htmlFor="email">Email Address</label>
                        <div className="mm-input-wrapper">
                            <IconMail className="mm-input-icon" size={20} />
                            <input
                                type="email"
                                id="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={loading}
                            />
                        </div>
                    </div>
                    {error && <p className="mm-error-text">{error}</p>}
                    <Button type="submit" variant="primary" loading={loading} className="mm-lead-submit-btn">
                        Get My Free Guide
                    </Button>
                </form>
            </div>
        </section>
    );
};

export default LeadMagnet;
