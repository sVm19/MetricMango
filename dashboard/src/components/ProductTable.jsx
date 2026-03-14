import React, { useEffect, useState } from "react";
import Button from "./Button.jsx";
import { updateProductPlanning } from "../api.js";

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function formatStockCover(value) {
  if (!Number.isFinite(Number(value))) return "No sales velocity";
  return `~${Math.max(0, Math.ceil(Number(value)))} days`;
}

export default function ProductTable({ rows, suppliers, locked, onPlanningUpdated }) {
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState("");
  const [rowErrors, setRowErrors] = useState({});

  useEffect(() => {
    const nextDrafts = {};
    (rows || []).forEach(row => {
      nextDrafts[row.id] = {
        leadTimeDays: String(row.leadTimeDays ?? ""),
        supplierId: row.supplierId || "",
        supplierName: row.supplierName || ""
      };
    });
    setDrafts(nextDrafts);
  }, [rows]);

  if (!rows || rows.length === 0) {
    return null;
  }

  function updateDraft(productId, field, value) {
    setDrafts(current => ({
      ...current,
      [productId]: {
        ...(current[productId] || {}),
        [field]: value
      }
    }));
  }

  async function handleSave(productId) {
    if (locked) return;
    const draft = drafts[productId] || {};
    const selectedSupplier = (suppliers || []).find(item => item.id === draft.supplierId);
    setRowErrors(current => ({ ...current, [productId]: "" }));
    setSavingId(productId);

    try {
      const payload = {
        leadTimeDays: Number(draft.leadTimeDays || 0),
        supplierId: String(draft.supplierId || ""),
        supplierName: selectedSupplier?.name || String(draft.supplierName || "").trim()
      };
      const updated = await updateProductPlanning(productId, payload);
      if (typeof onPlanningUpdated === "function") {
        onPlanningUpdated(updated);
      }
    } catch (error) {
      setRowErrors(current => ({
        ...current,
        [productId]: error?.data?.error || error?.message || "Unable to save planning fields."
      }));
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="table-wrap product-planning-table">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Price</th>
            <th>Stock</th>
            <th>Lead Time</th>
            <th>Supplier</th>
            <th>Stock Cover</th>
            <th>Suggested Reorder</th>
            <th>Save</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const draft = drafts[row.id] || {};
            const isLowStock = String(row.suggestion || "").toUpperCase() === "RESTOCK";
            return (
              <tr key={row.id} className={isLowStock ? "low-stock" : ""}>
                <td data-label="Product">
                  <div className="product-name-cell">
                    <strong>{row.name}</strong>
                    <span className={`status ${isLowStock ? "status-alert" : "status-safe"}`}>{row.suggestion || "SAFE"}</span>
                  </div>
                  {rowErrors[row.id] ? <div className="row-inline-error">{rowErrors[row.id]}</div> : null}
                </td>
                <td data-label="Price">{formatMoney(row.price)}</td>
                <td data-label="Stock">{row.currentStock}</td>
                <td data-label="Lead Time">
                  <input
                    className="table-input"
                    type="number"
                    min="1"
                    max="90"
                    value={draft.leadTimeDays ?? ""}
                    onChange={event => updateDraft(row.id, "leadTimeDays", event.target.value)}
                    disabled={locked}
                  />
                </td>
                <td data-label="Supplier">
                  <select
                    className="table-input"
                    value={draft.supplierId ?? ""}
                    onChange={event => {
                      const nextSupplier = (suppliers || []).find(item => item.id === event.target.value);
                      updateDraft(row.id, "supplierId", event.target.value);
                      updateDraft(row.id, "supplierName", nextSupplier?.name || "");
                    }}
                    disabled={locked}
                  >
                    <option value="">No supplier</option>
                    {(suppliers || []).map(supplier => (
                      <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                    ))}
                  </select>
                  {!draft.supplierId && draft.supplierName ? (
                    <span className="table-input-hint">Legacy supplier: {draft.supplierName}</span>
                  ) : null}
                </td>
                <td data-label="Stock Cover">{formatStockCover(row.daysUntilStockout)}</td>
                <td data-label="Suggested Reorder" className="metric">{row.recommendedReorderQty ?? 0}</td>
                <td data-label="Save">
                  <Button
                    type="button"
                    variant="secondary"
                    loading={savingId === row.id}
                    loadingText="Saving..."
                    disabled={locked}
                    onClick={() => handleSave(row.id)}
                  >
                    Save
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
