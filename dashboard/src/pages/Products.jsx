import React, { useEffect, useState } from "react";
import Button from "../components/Button.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ProductTable from "../components/ProductTable.jsx";
import { exportOrdersCsv, exportProductsCsv, getProducts } from "../api.js";
import { useAccess } from "../access/AccessContext.jsx";

export default function Products() {
  const { locked, loading: accessLoading, error: accessError } = useAccess();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState("");
  const [exportError, setExportError] = useState("");

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
        const data = await getProducts();
        if (!active) return;
        setRows(data.products || []);
      } catch (requestError) {
        if (!active) return;
        setError("Failed to load products");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [locked]);

  async function handleExport(kind) {
    if (locked) return;
    setExportError("");
    setExporting(kind);
    try {
      if (kind === "orders") {
        await exportOrdersCsv();
      } else {
        await exportProductsCsv();
      }
    } catch (requestError) {
      setExportError("Unable to export CSV right now.");
    } finally {
      setExporting("");
    }
  }

  if (accessLoading) return <div className="empty">Loading products...</div>;
  if (accessError && !locked) return <div className="empty">{accessError}</div>;
  if (loading) return <div className="empty">Loading products...</div>;
  if (error && !locked) return <div className="empty">{error}</div>;

  return (
    <div className="page dashboard-page">
      <div className="page-header">
        <div>
          <h2>Products</h2>
          <p className="page-subtitle">Current inventory for this store.</p>
        </div>
      </div>
      <div className="section-divider" aria-hidden="true" />
      <section className="card dashboard-section">
        <div className="card-actions">
          <h2>Products Overview</h2>
          <div className="csv-actions">
            <Button
              type="button"
              disabled={locked || exporting === "orders"}
              loading={exporting === "orders"}
              loadingText="Exporting..."
              variant="secondary"
              onClick={() => handleExport("orders")}
              title={locked ? "Upgrade to unlock CSV export" : ""}
            >
              Export Orders CSV
            </Button>
            <Button
              type="button"
              disabled={locked || exporting === "products"}
              loading={exporting === "products"}
              loadingText="Exporting..."
              variant="secondary"
              onClick={() => handleExport("products")}
              title={locked ? "Upgrade to unlock CSV export" : ""}
            >
              Export Products CSV
            </Button>
          </div>
        </div>

        {locked ? (
          <EmptyState
            title="CSV export is locked"
            description="Your trial has expired. Upgrade to continue exporting data."
          />
        ) : null}
        {exportError ? (
          <EmptyState
            title="Unable to export CSV right now"
            description={exportError}
          />
        ) : null}
        <ProductTable rows={rows} />
        {!locked && rows.length === 0 ? (
          <EmptyState
            title="No products yet"
            description="We'll show insights once your first order arrives. Create a test order in Shopify to populate products."
          />
        ) : null}
      </section>
    </div>
  );
}
