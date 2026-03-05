const ALLOWED_PURCHASE_ORDER_STATUSES = new Set(["draft", "approved", "exported"]);

function normalizePurchaseOrderLineItem(item = {}) {
  return {
    productId: String(item.productId || item.id || "").trim(),
    name: String(item.name || "").trim(),
    supplierId: String(item.supplierId || "").trim(),
    supplierName: String(item.supplierName || "").trim(),
    currentStock: Number(item.currentStock || 0),
    avgDailySales: Number(item.avgDailySales || 0),
    leadTimeDays: Number(item.leadTimeDays || 0),
    planningWindowDays: Number(item.planningWindowDays || 0),
    recommendedReorderQty: Math.max(0, Math.ceil(Number(item.recommendedReorderQty || 0))),
    revenueAtRisk: Number(item.revenueAtRisk || 0),
    suggestion: String(item.suggestion || "SAFE").toUpperCase()
  };
}

function buildPurchaseOrderDraft({ supplier = {}, items = [], notes = "" } = {}) {
  const lineItems = items
    .map(normalizePurchaseOrderLineItem)
    .filter(item => item.recommendedReorderQty > 0 && item.suggestion === "RESTOCK");

  const totals = lineItems.reduce((acc, item) => {
    acc.itemCount += 1;
    acc.totalUnits += Number(item.recommendedReorderQty || 0);
    acc.totalRevenueAtRisk += Number(item.revenueAtRisk || 0);
    return acc;
  }, {
    itemCount: 0,
    totalUnits: 0,
    totalRevenueAtRisk: 0
  });

  return {
    supplierId: String(supplier.id || supplier.supplierId || "").trim(),
    supplierName: String(supplier.name || supplier.supplierName || "Mixed suppliers").trim(),
    notes: String(notes || "").trim(),
    status: "draft",
    lineItems,
    totals
  };
}

function filterRestockItemsForSupplier(items = [], { supplierId = "", supplierName = "" } = {}) {
  const normalizedSupplierId = String(supplierId || "").trim();
  const normalizedSupplierName = String(supplierName || "").trim().toLowerCase();
  if (!normalizedSupplierId && !normalizedSupplierName) {
    return items.filter(item => String(item?.suggestion || "").toUpperCase() === "RESTOCK");
  }

  return items.filter(item => {
    if (String(item?.suggestion || "").toUpperCase() !== "RESTOCK") {
      return false;
    }
    const itemSupplierId = String(item?.supplierId || "").trim();
    const itemSupplierName = String(item?.supplierName || "").trim().toLowerCase();
    return itemSupplierId === normalizedSupplierId || (!normalizedSupplierId && itemSupplierName === normalizedSupplierName);
  });
}

function toPurchaseOrderCsvRows(purchaseOrder = {}) {
  return (purchaseOrder.lineItems || []).map(item => ({
    purchaseOrderId: String(purchaseOrder.id || ""),
    supplierName: String(purchaseOrder.supplierName || ""),
    status: String(purchaseOrder.status || "draft"),
    productId: String(item.productId || ""),
    name: String(item.name || ""),
    currentStock: Number(item.currentStock || 0),
    avgDailySales: Number(item.avgDailySales || 0),
    leadTimeDays: Number(item.leadTimeDays || 0),
    planningWindowDays: Number(item.planningWindowDays || 0),
    recommendedReorderQty: Number(item.recommendedReorderQty || 0),
    revenueAtRisk: Number(item.revenueAtRisk || 0)
  }));
}

module.exports = {
  ALLOWED_PURCHASE_ORDER_STATUSES,
  buildPurchaseOrderDraft,
  filterRestockItemsForSupplier,
  toPurchaseOrderCsvRows
};
