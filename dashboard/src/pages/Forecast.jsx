import React, { useEffect, useState } from "react";
import EmptyState from "../components/EmptyState.jsx";
import { getForecast, getRestockSuggestions } from "../api.js";
import { useAccess } from "../access/AccessContext.jsx";

export default function Forecast() {
  const { locked, loading: accessLoading, error: accessError } = useAccess();
  const [forecast, setForecast] = useState([]);
  const [restock, setRestock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      if (locked) {
        if (active) setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");
        const forecastData = await getForecast();
        const restockData = await getRestockSuggestions();

        if (!active) return;
        setForecast(forecastData.data || []);
        setRestock(restockData.suggestions || []);
      } catch (error) {
        if (!active) return;
        setError("Failed to load forecast");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [locked]);

  if (accessLoading) return <div className="empty">Loading forecast...</div>;
  if (accessError && !locked) return <div className="empty">{accessError}</div>;
  if (loading && !locked) return <div className="empty">Loading forecast...</div>;
  if (error && !locked) return <div className="empty">{error}</div>;
  const hasAnyData = forecast.length > 0 || restock.length > 0;

  return (
    <div className="page dashboard-page">
      {locked ? (
        <div className="trial-banner" role="status" aria-live="polite">
          Trial expired. Upgrade to unlock Forecast and Restock.
        </div>
      ) : null}
      <div className={locked ? "feature-locked-blur" : ""}>
        {!locked && !hasAnyData ? (
          <section className="card empty-state-card">
            <h2>No Data Yet</h2>
            <EmptyState
              title="We'll show insights once your first order arrives"
              description="Create a test order in Shopify to generate forecast and restock recommendations."
            />
          </section>
        ) : null}
        <div className="page-header">
          <div>
            <h2>Forecast</h2>
            <p className="page-subtitle">Recent averages and restock guidance.</p>
          </div>
        </div>
        <div className="section-divider" aria-hidden="true" />
        <section className="card dashboard-section">
          <h2>7-Day Forecast</h2>
          {forecast.length === 0 ? (
            <EmptyState
              title={locked ? "Upgrade to unlock Forecast" : "No forecast data yet"}
              description={locked ? "Your trial has expired. Upgrade to restore forecasting." : "Forecast data will appear once orders are synced."}
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Avg (7d)</th>
                    <th>Avg (14d)</th>
                    <th>Avg (30d)</th>
                    <th>Next 7d Total</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.map(item => (
                    <tr key={item.productId}>
                      <td>{item.productId}</td>
                      <td className="metric">{item.forecast.ma7.toFixed(1)}</td>
                      <td>{item.forecast.ma14.toFixed(1)}</td>
                      <td>{item.forecast.ma30.toFixed(1)}</td>
                      <td>{Math.round(item.forecast.next7Days)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card dashboard-section">
          <h2>Restock Suggestions</h2>
          {restock.length === 0 ? (
            <EmptyState
              title={locked ? "Upgrade to unlock Restock Suggestions" : "No restock suggestions yet"}
              description={locked ? "Your trial has expired. Upgrade to restore restock recommendations." : "Restock signals will appear after sales activity is available."}
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Expected Demand</th>
                    <th>Current Stock</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {restock.map(item => (
                    <tr key={item.productId}>
                      <td>{item.productId}</td>
                      <td className="metric">{item.expectedDemand.toFixed(1)}</td>
                      <td>{item.currentStock}</td>
                      <td>
                        <span className={`status ${item.suggestion === "RESTOCK" ? "status-alert" : "status-safe"}`}>
                          {item.suggestion}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
