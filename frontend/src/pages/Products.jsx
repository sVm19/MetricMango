import React, { useEffect, useState } from "react";
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
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Products</h2>
          <p className="page-subtitle">Current inventory for this store.</p>
        </div>
      </div>
      <section className="card">
        <div className="card-actions">
          <h2>Products Overview</h2>
          <div className="csv-actions">
            <button
              type="button"
              className="auth-btn auth-btn-primary"
              disabled={locked || exporting === "orders"}
              onClick={() => handleExport("orders")}
              title={locked ? "Upgrade to unlock CSV export" : ""}
            >
              {exporting === "orders" ? "Exporting..." : "Export Orders CSV"}
            </button>
            <button
              type="button"
              className="auth-btn auth-btn-primary"
              disabled={locked || exporting === "products"}
              onClick={() => handleExport("products")}
              title={locked ? "Upgrade to unlock CSV export" : ""}
            >
              {exporting === "products" ? "Exporting..." : "Export Products CSV"}
            </button>
          </div>
        </div>

        {locked ? <div className="empty">CSV export is locked after trial expiry. Upgrade to continue.</div> : null}
        {exportError ? <div className="empty">{exportError}</div> : null}
        <ProductTable rows={rows} emptyLabel="No products yet." />
        {!locked && rows.length === 0 ? (
          <div className="empty-state-inline">
            We&apos;ll show insights once your first order arrives. Create a test order in Shopify to populate products.
          </div>
        ) : null}
      </section>
    </div>
  );
}
