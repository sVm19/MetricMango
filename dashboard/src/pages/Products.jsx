import React, { useEffect, useState } from "react";
import Button from "../components/Button.jsx";
import EmptyState from "../components/EmptyState.jsx";
const ProductTable = React.lazy(() => import("../components/ProductTable.jsx"));
import {
  createPurchaseOrderDraft,
  createSupplier,
  exportOrdersCsv,
  exportProductsCsv,
  exportPurchaseOrderCsv,
  exportRestockPlanCsv,
  getInventorySettings,
  getProducts,
  getPurchaseOrders,
  getRestockSuggestions,
  getSuppliers,
  postRetentionHeartbeat,
  updateInventorySettings,
  updatePurchaseOrder
} from "../api.js";
import { useAccess } from "../access/AccessContext.jsx";

function createEmptySettings() {
  return {
    lowStockAlertsEnabled: true,
    lowStockThresholdDays: 5,
    lowStockThresholdUnits: null,
    alertFrequency: "daily",
    alertRecipientEmail: "",
    salesSpikeAlertsEnabled: false,
    salesSpikeThresholdPercent: 30,
    defaultLeadTimeDays: 7,
    safetyBufferDays: 0,
    weeklyActionPlanEnabled: true
  };
}

function createFormState(settings = createEmptySettings()) {
  return {
    lowStockAlertsEnabled: Boolean(settings.lowStockAlertsEnabled),
    lowStockThresholdDays: String(settings.lowStockThresholdDays ?? 5),
    lowStockThresholdUnits: settings.lowStockThresholdUnits === null ? "" : String(settings.lowStockThresholdUnits),
    alertFrequency: settings.alertFrequency || "daily",
    alertRecipientEmail: settings.alertRecipientEmail || "",
    salesSpikeAlertsEnabled: Boolean(settings.salesSpikeAlertsEnabled),
    salesSpikeThresholdPercent: String(settings.salesSpikeThresholdPercent ?? 30),
    defaultLeadTimeDays: String(settings.defaultLeadTimeDays ?? 7),
    safetyBufferDays: String(settings.safetyBufferDays ?? 0),
    weeklyActionPlanEnabled: Boolean(settings.weeklyActionPlanEnabled)
  };
}

function createSupplierForm() {
  return {
    name: "",
    contactEmail: "",
    defaultLeadTimeDays: "7",
    notes: ""
  };
}

function mergeProductRows(products = [], restockSuggestions = []) {
  const restockById = new Map(restockSuggestions.map(item => [String(item.productId || item.id || ""), item]));
  return products.map(product => {
    const restock = restockById.get(String(product.id || "")) || {};
    return {
      ...product,
      ...restock,
      id: product.id,
      leadTimeDays: restock.leadTimeDays ?? product.leadTimeDays ?? 7,
      supplierId: restock.supplierId ?? product.supplierId ?? "",
      supplierName: restock.supplierName ?? product.supplierName ?? ""
    };
  });
}

export default function Products() {
  const { locked, loading: accessLoading, error: accessError } = useAccess();
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settingsForm, setSettingsForm] = useState(createFormState());
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSuccess, setSettingsSuccess] = useState("");
  const [supplierForm, setSupplierForm] = useState(createSupplierForm());
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierError, setSupplierError] = useState("");
  const [supplierSuccess, setSupplierSuccess] = useState("");
  const [poAction, setPoAction] = useState("");
  const [poError, setPoError] = useState("");
  const [exporting, setExporting] = useState("");
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    postRetentionHeartbeat("products").catch(() => { });
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      if (locked) {
        if (active) {
          setLoading(false);
          setSettingsLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setSettingsLoading(true);
        setError("");
        setSettingsError("");
        const [productData, restockData, settingsData, supplierData, purchaseOrderData] = await Promise.all([
          getProducts(),
          getRestockSuggestions(),
          getInventorySettings(),
          getSuppliers(),
          getPurchaseOrders()
        ]);
        if (!active) return;

        setRows(mergeProductRows(productData?.products || [], restockData?.suggestions || []));
        setSettingsForm(createFormState(settingsData || createEmptySettings()));
        setSuppliers(supplierData?.suppliers || []);
        setPurchaseOrders(purchaseOrderData?.purchaseOrders || []);
      } catch {
        if (!active) return;
        setError("Failed to load products");
        setSettingsError("Failed to load inventory settings.");
      } finally {
        if (active) {
          setLoading(false);
          setSettingsLoading(false);
        }
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [locked]);

  function handleSettingsChange(field, value) {
    setSettingsForm(current => ({ ...current, [field]: value }));
    setSettingsSuccess("");
  }

  async function refreshPlanningData() {
    const [productData, restockData, supplierData, purchaseOrderData] = await Promise.all([
      getProducts(),
      getRestockSuggestions(),
      getSuppliers(),
      getPurchaseOrders()
    ]);
    setRows(mergeProductRows(productData?.products || [], restockData?.suggestions || []));
    setSuppliers(supplierData?.suppliers || []);
    setPurchaseOrders(purchaseOrderData?.purchaseOrders || []);
  }

  async function handleSettingsSave() {
    if (locked) return;
    setSettingsSaving(true);
    setSettingsError("");
    setSettingsSuccess("");

    try {
      const payload = {
        lowStockAlertsEnabled: Boolean(settingsForm.lowStockAlertsEnabled),
        lowStockThresholdDays: Number(settingsForm.lowStockThresholdDays || 0),
        lowStockThresholdUnits: settingsForm.lowStockThresholdUnits === "" ? null : Number(settingsForm.lowStockThresholdUnits),
        alertFrequency: settingsForm.alertFrequency,
        alertRecipientEmail: settingsForm.alertRecipientEmail,
        salesSpikeAlertsEnabled: Boolean(settingsForm.salesSpikeAlertsEnabled),
        salesSpikeThresholdPercent: Number(settingsForm.salesSpikeThresholdPercent || 0),
        defaultLeadTimeDays: Number(settingsForm.defaultLeadTimeDays || 0),
        safetyBufferDays: Number(settingsForm.safetyBufferDays || 0),
        weeklyActionPlanEnabled: Boolean(settingsForm.weeklyActionPlanEnabled)
      };
      const updated = await updateInventorySettings(payload);
      setSettingsForm(createFormState(updated));
      setSettingsSuccess("Inventory settings updated.");
      await refreshPlanningData();
    } catch (saveError) {
      setSettingsError(saveError?.data?.error || saveError?.message || "Failed to update inventory settings.");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handlePlanningUpdated() {
    try {
      await refreshPlanningData();
    } catch {
      // Keep current state if the refresh fails.
    }
  }

  async function handleSupplierCreate() {
    if (locked) return;
    setSupplierSaving(true);
    setSupplierError("");
    setSupplierSuccess("");

    try {
      await createSupplier({
        name: supplierForm.name,
        contactEmail: supplierForm.contactEmail,
        defaultLeadTimeDays: Number(supplierForm.defaultLeadTimeDays || 0),
        notes: supplierForm.notes
      });
      setSupplierForm(createSupplierForm());
      setSupplierSuccess("Supplier added.");
      const supplierData = await getSuppliers();
      setSuppliers(supplierData?.suppliers || []);
    } catch (requestError) {
      setSupplierError(requestError?.data?.error || requestError?.message || "Failed to add supplier.");
    } finally {
      setSupplierSaving(false);
    }
  }

  async function handleCreateDraft(supplier) {
    if (locked) return;
    setPoAction(`draft:${supplier?.id || "mixed"}`);
    setPoError("");
    try {
      await createPurchaseOrderDraft(supplier ? { supplierId: supplier.id, supplierName: supplier.name } : {});
      const purchaseOrderData = await getPurchaseOrders();
      setPurchaseOrders(purchaseOrderData?.purchaseOrders || []);
    } catch (requestError) {
      setPoError(requestError?.data?.error || requestError?.message || "Unable to create PO draft.");
    } finally {
      setPoAction("");
    }
  }

  async function handlePurchaseOrderStatus(order, status) {
    setPoAction(`${status}:${order.id}`);
    setPoError("");
    try {
      await updatePurchaseOrder(order.id, { status });
      const purchaseOrderData = await getPurchaseOrders();
      setPurchaseOrders(purchaseOrderData?.purchaseOrders || []);
    } catch (requestError) {
      setPoError(requestError?.data?.error || requestError?.message || "Unable to update purchase order.");
    } finally {
      setPoAction("");
    }
  }

  async function handleExport(kind, purchaseOrderId = "") {
    if (locked) return;
    setExportError("");
    setExporting(kind === "purchase-order" ? `${kind}:${purchaseOrderId}` : kind);
    try {
      if (kind === "orders") {
        await exportOrdersCsv();
      } else if (kind === "products") {
        await exportProductsCsv();
      } else if (kind === "restock") {
        await exportRestockPlanCsv();
      } else {
        await exportPurchaseOrderCsv(purchaseOrderId);
      }
    } catch {
      setExportError("Unable to export CSV right now.");
    } finally {
      setExporting("");
    }
  }

  const fullPageSkeleton = (
    <div className="page dashboard-page animate-pulse">
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div className="skeleton skeleton-title"></div>
        <div className="skeleton skeleton-text" style={{ width: '40%' }}></div>
      </div>
      <div className="card dashboard-section skeleton skeleton-card"></div>
      <div className="card dashboard-section skeleton skeleton-card"></div>
    </div>
  );

  if (accessLoading) return fullPageSkeleton;
  if (accessError && !locked) return <div className="empty">{accessError}</div>;
  if (loading && !locked) return fullPageSkeleton;
  if (error && !locked) return <div className="empty">{error}</div>;

  return (
    <div className="page dashboard-page">
      <div className="page-header">
        <div>
          <h2>Products</h2>
          <p className="page-subtitle">Manage suppliers, turn restock insight into purchase drafts, and tune alert settings.</p>
        </div>
      </div>
      <div className="section-divider" aria-hidden="true" />

      <section className="card dashboard-section">
        <div className="card-actions">
          <div>
            <h2>Inventory Settings</h2>
            <p className="page-subtitle">Control when Metric Mango alerts you and how reorder windows are calculated.</p>
          </div>
          <Button
            type="button"
            variant="primary"
            loading={settingsSaving}
            loadingText="Saving..."
            disabled={locked || settingsLoading}
            onClick={handleSettingsSave}
          >
            Save Settings
          </Button>
        </div>

        {settingsLoading ? (
          <EmptyState title="Loading settings..." description="Fetching alert thresholds and planning defaults." />
        ) : (
          <div className="inventory-settings-grid">
            <label className="settings-field settings-field-checkbox">
              <input type="checkbox" checked={settingsForm.lowStockAlertsEnabled} onChange={event => handleSettingsChange("lowStockAlertsEnabled", event.target.checked)} disabled={locked} />
              <span>Enable low-stock alerts</span>
            </label>
            <label className="settings-field">
              <span>Threshold days</span>
              <input type="number" min="1" max="60" value={settingsForm.lowStockThresholdDays} onChange={event => handleSettingsChange("lowStockThresholdDays", event.target.value)} disabled={locked} />
            </label>
            <label className="settings-field">
              <span>Threshold units</span>
              <input type="number" min="0" value={settingsForm.lowStockThresholdUnits} onChange={event => handleSettingsChange("lowStockThresholdUnits", event.target.value)} disabled={locked} placeholder="Leave blank to disable" />
            </label>
            <label className="settings-field">
              <span>Alert frequency</span>
              <select value={settingsForm.alertFrequency} onChange={event => handleSettingsChange("alertFrequency", event.target.value)} disabled={locked}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Alert recipient email</span>
              <input type="email" value={settingsForm.alertRecipientEmail} onChange={event => handleSettingsChange("alertRecipientEmail", event.target.value)} disabled={locked} />
            </label>
            <label className="settings-field settings-field-checkbox">
              <input type="checkbox" checked={settingsForm.salesSpikeAlertsEnabled} onChange={event => handleSettingsChange("salesSpikeAlertsEnabled", event.target.checked)} disabled={locked} />
              <span>Enable sales-spike alerts</span>
            </label>
            <label className="settings-field">
              <span>Sales spike threshold %</span>
              <input type="number" min="10" max="500" value={settingsForm.salesSpikeThresholdPercent} onChange={event => handleSettingsChange("salesSpikeThresholdPercent", event.target.value)} disabled={locked} />
            </label>
            <label className="settings-field">
              <span>Default lead time days</span>
              <input type="number" min="1" max="90" value={settingsForm.defaultLeadTimeDays} onChange={event => handleSettingsChange("defaultLeadTimeDays", event.target.value)} disabled={locked} />
            </label>
            <label className="settings-field">
              <span>Safety buffer days</span>
              <input type="number" min="0" max="30" value={settingsForm.safetyBufferDays} onChange={event => handleSettingsChange("safetyBufferDays", event.target.value)} disabled={locked} />
            </label>
            <label className="settings-field settings-field-checkbox">
              <input type="checkbox" checked={settingsForm.weeklyActionPlanEnabled} onChange={event => handleSettingsChange("weeklyActionPlanEnabled", event.target.checked)} disabled={locked} />
              <span>Enable weekly action plan email</span>
            </label>
          </div>
        )}

        {settingsSuccess ? <p className="form-message form-message-success">{settingsSuccess}</p> : null}
        {settingsError ? <p className="form-message form-message-error">{settingsError}</p> : null}
      </section>

      <div className="section-divider" aria-hidden="true" />

      <section className="card dashboard-section">
        <div className="card-actions">
          <div>
            <h2>Supplier Directory</h2>
            <p className="page-subtitle">Keep lead times and contacts in one place so reorder drafts stay usable.</p>
          </div>
          <Button type="button" variant="secondary" disabled={locked} loading={poAction === "draft:mixed"} loadingText="Building..." onClick={() => handleCreateDraft(null)}>
            Draft PO From All Restocks
          </Button>
        </div>

        <div className="supplier-directory-grid">
          <div className="supplier-form-card">
            <h3>Add Supplier</h3>
            <div className="inventory-settings-grid compact">
              <label className="settings-field">
                <span>Name</span>
                <input type="text" value={supplierForm.name} onChange={event => setSupplierForm(current => ({ ...current, name: event.target.value }))} disabled={locked} />
              </label>
              <label className="settings-field">
                <span>Contact email</span>
                <input type="email" value={supplierForm.contactEmail} onChange={event => setSupplierForm(current => ({ ...current, contactEmail: event.target.value }))} disabled={locked} />
              </label>
              <label className="settings-field">
                <span>Default lead time</span>
                <input type="number" min="1" max="90" value={supplierForm.defaultLeadTimeDays} onChange={event => setSupplierForm(current => ({ ...current, defaultLeadTimeDays: event.target.value }))} disabled={locked} />
              </label>
              <label className="settings-field settings-field-wide">
                <span>Notes</span>
                <textarea value={supplierForm.notes} onChange={event => setSupplierForm(current => ({ ...current, notes: event.target.value }))} disabled={locked} rows="3" />
              </label>
            </div>
            <Button type="button" variant="primary" disabled={locked} loading={supplierSaving} loadingText="Saving..." onClick={handleSupplierCreate}>
              Add Supplier
            </Button>
            {supplierSuccess ? <p className="form-message form-message-success">{supplierSuccess}</p> : null}
            {supplierError ? <p className="form-message form-message-error">{supplierError}</p> : null}
          </div>

          <div className="supplier-list">
            {suppliers.length === 0 ? (
              <EmptyState title="No suppliers yet" description="Add your first supplier to start drafting cleaner purchase orders." />
            ) : suppliers.map(supplier => (
              <article key={supplier.id} className="supplier-card">
                <div className="supplier-card-head">
                  <div>
                    <h3>{supplier.name}</h3>
                    <p>{supplier.contactEmail || "No contact email"}</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={locked}
                    loading={poAction === `draft:${supplier.id}`}
                    loadingText="Building..."
                    onClick={() => handleCreateDraft(supplier)}
                  >
                    Draft PO
                  </Button>
                </div>
                <div className="supplier-meta-row">
                  <span>Lead time: {supplier.defaultLeadTimeDays} days</span>
                  <span>Linked products: {supplier.linkedProductCount}</span>
                </div>
                <p className="supplier-notes">{supplier.notes || "No notes yet."}</p>
                {supplier.linkedProducts?.length ? (
                  <div className="supplier-tags">
                    {supplier.linkedProducts.map(product => (
                      <span key={product.productId} className="supplier-tag">{product.name}</span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider" aria-hidden="true" />

      <section className="card dashboard-section">
        <div className="card-actions">
          <div>
            <h2>Purchase Order Workflow</h2>
            <p className="page-subtitle">Create drafts from restock logic, approve them, and export the final CSV for manual sending.</p>
          </div>
        </div>

        {purchaseOrders.length === 0 ? (
          <EmptyState title="No purchase order drafts yet" description="Create a supplier draft to turn your restock list into an actionable order." />
        ) : (
          <div className="purchase-order-list">
            {purchaseOrders.map(order => (
              <article key={order.id} className="purchase-order-card">
                <div className="purchase-order-head">
                  <div>
                    <h3>{order.supplierName || "Mixed suppliers"}</h3>
                    <p>{order.totals?.itemCount || 0} items • {order.totals?.totalUnits || 0} units</p>
                  </div>
                  <span className={`status ${order.status === "approved" ? "status-safe" : order.status === "exported" ? "status-neutral" : "status-alert"}`}>
                    {order.status || "draft"}
                  </span>
                </div>
                <div className="purchase-order-meta">
                  <span>Revenue at risk: {order.totals?.totalRevenueAtRisk || 0}</span>
                  <span>{order.notes || "No notes"}</span>
                </div>
                <div className="csv-actions">
                  <Button type="button" variant="secondary" disabled={locked || order.status === "approved" || order.status === "exported"} loading={poAction === `approved:${order.id}`} loadingText="Approving..." onClick={() => handlePurchaseOrderStatus(order, "approved")}>
                    Approve
                  </Button>
                  <Button type="button" variant="secondary" disabled={locked} loading={exporting === `purchase-order:${order.id}`} loadingText="Exporting..." onClick={() => handleExport("purchase-order", order.id)}>
                    Export CSV
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
        {poError ? <p className="form-message form-message-error">{poError}</p> : null}
      </section>

      <div className="section-divider" aria-hidden="true" />

      <section className="card dashboard-section">
        <div className="card-actions">
          <h2>Products Overview</h2>
          <div className="csv-actions">
            <Button type="button" disabled={locked || exporting === "orders"} loading={exporting === "orders"} loadingText="Exporting..." variant="secondary" onClick={() => handleExport("orders")}>
              Export Orders CSV
            </Button>
            <Button type="button" disabled={locked || exporting === "products"} loading={exporting === "products"} loadingText="Exporting..." variant="secondary" onClick={() => handleExport("products")}>
              Export Products CSV
            </Button>
            <Button type="button" disabled={locked || exporting === "restock"} loading={exporting === "restock"} loadingText="Exporting..." variant="secondary" onClick={() => handleExport("restock")}>
              Export Reorder CSV
            </Button>
          </div>
        </div>

        {locked ? (
          <EmptyState title="Planning tools are locked" description="Your trial has expired. Upgrade to continue managing inventory settings, suppliers, and purchase orders." />
        ) : null}
        {exportError ? <EmptyState title="Unable to export CSV right now" description={exportError} /> : null}
        <React.Suspense fallback={<div className="skeleton skeleton-card animate-pulse" style={{ height: '300px' }}></div>}>
          <ProductTable rows={rows} suppliers={suppliers} locked={locked} onPlanningUpdated={handlePlanningUpdated} />
        </React.Suspense>
        {!locked && rows.length === 0 ? (
          <EmptyState title="No products yet" description="We'll show insights once your first order arrives. Create a test order in Shopify to populate products." />
        ) : null}
      </section>
    </div>
  );
}
