import React, { useEffect, useState } from "react";
import { getAnalytics } from "../api.js";
import EmptyState from "./EmptyState.jsx";

function formatMoney(value, currency = "USD") {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency,
        maximumFractionDigits: 0
    }).format(value || 0);
}

const RevenueLineChart = React.memo(({ hourlyRevenueTrend }) => {
    const [isVisible, setIsVisible] = useState(false);
    const chartRef = React.useRef(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.1 }
        );
        if (chartRef.current) observer.observe(chartRef.current);
        return () => observer.disconnect();
    }, []);

    const { fillD, pathD } = React.useMemo(() => {
        if (!isVisible || !hourlyRevenueTrend || hourlyRevenueTrend.length === 0) return { fillD: "", pathD: "" };
        let points = hourlyRevenueTrend;
        if (points.length > 24) {
            const step = Math.ceil(points.length / 24);
            points = points.filter((_, i) => i % step === 0);
        }
        const maxRevenue = Math.max(1, ...points.map(h => h.revenue || 0));
        const width = 1000;
        const height = 150;
        const stepX = width / Math.max(1, points.length - 1);
        const path = points.map((point, i) => {
            const x = i * stepX;
            const y = height - Math.max(5, (point.revenue / maxRevenue) * height);
            return `${i === 0 ? "M" : "L"} ${x} ${y}`;
        }).join(" ");
        return { pathD: path, fillD: `${path} L 1000 150 L 0 150 Z` };
    }, [hourlyRevenueTrend, isVisible]);

    return (
        <div ref={chartRef} style={{ width: '100%', height: '160px', marginTop: '16px', position: 'relative' }}>
            {isVisible && pathD ? (
                <svg width="100%" height="100%" viewBox="0 0 1000 150" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="gradientLine" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    <path d={fillD} fill="url(#gradientLine)" stroke="none" opacity="0.2" />
                    <path d={pathD} fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            ) : null}
        </div>
    );
});

export default function StoreAnalytics({ impactCurrency = "USD" }) {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const fetchAnalytics = async (active) => {
        try {
            const data = await getAnalytics();
            if (active) {
                setAnalytics(data);
                setError("");
            }
        } catch (err) {
            if (active) setError(err.message || "Failed to load analytics");
        } finally {
            if (active) setLoading(false);
        }
    };

    useEffect(() => {
        let active = true;
        setLoading(true);
        fetchAnalytics(active);

        const interval = setInterval(() => {
            fetchAnalytics(active);
        }, 60000); // refresh every 60 seconds

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, []);

    if (loading && !analytics) {
        return (
            <section className="card dashboard-section">
                <h2>Store Analytics (24h)</h2>
                <EmptyState title="Loading real-time syncing..." description="Waiting for the latest store data..." />
            </section>
        );
    }

    if (error && !analytics) {
        return (
            <section className="card dashboard-section">
                <h2>Store Analytics (24h)</h2>
                <EmptyState title="Analytics Unavailable" description={error} />
            </section>
        );
    }

    if (!analytics) return null;

    // Extract variables
    const { revenueLast24Hours, totalOrders, conversionRate, hourlyRevenueTrend = [], topSellingProducts = [] } = analytics;

    return (
        <section className="card dashboard-section store-analytics">
            <div className="section-heading">
                <h2>Live Analytics <span className="stat-helper">(Last 24 Hours)</span></h2>
                <p className="page-subtitle">Auto-refreshing view of your recent store performance.</p>
            </div>

            <div className="impact-grid store-analytics-kpis">
                <article className="stat-card impact-card">
                    <div className="stat-label">24h Revenue</div>
                    <div className="stat-value">{formatMoney(revenueLast24Hours, impactCurrency)}</div>
                </article>

                <article className="stat-card impact-card">
                    <div className="stat-label">24h Orders</div>
                    <div className="stat-value">{totalOrders}</div>
                </article>

                <article className="stat-card impact-card">
                    <div className="stat-label">Conversion Rate</div>
                    <div className="stat-value">{Number(conversionRate || 0).toFixed(2)}%</div>
                    <div className="stat-helper">Orders per visitor proxy</div>
                </article>
            </div>

            <div className="charts-grid store-analytics-charts" style={{ marginTop: '24px' }}>

                <article className="chart-card">
                    <h3>Hourly Revenue Trend</h3>
                    {hourlyRevenueTrend.length === 0 ? (
                        <EmptyState title="No detailed data" description="Waiting for more hours of data." />
                    ) : (
                        <RevenueLineChart hourlyRevenueTrend={hourlyRevenueTrend} />
                    )}
                </article>

                <article className="chart-card">
                    <h3>Top Products Sold (24h)</h3>
                    {topSellingProducts.length === 0 ? (
                        <EmptyState title="No sales yet" description="Products sold over the last 24h will show here." />
                    ) : (
                        <div className="table-wrap">
                            <table className="products-table" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', fontSize: '0.85rem' }}>
                                        <th style={{ padding: '8px 0' }}>Product</th>
                                        <th style={{ padding: '8px 0', textAlign: 'right' }}>Qty Sold</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topSellingProducts.map(product => (
                                        <tr key={product.productId} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td data-label="Product" style={{ padding: '12px 0', fontSize: '0.95rem' }}>{product.name}</td>
                                            <td data-label="Qty Sold" style={{ padding: '12px 0', textAlign: 'right', fontWeight: 'bold' }}>{product.quantitySold}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </article>

            </div>
        </section>
    );
}
