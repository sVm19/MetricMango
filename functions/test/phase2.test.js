const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validatePurchaseOrderDraftPayload,
  validatePurchaseOrderPatch,
  validateRetentionRequestPayload,
  validateSupplierPayload
} = require("../src/services/inventorySettingsService");
const {
  buildPurchaseOrderDraft,
  filterRestockItemsForSupplier
} = require("../src/services/purchaseOrderService");
const { buildSkuAnalytics } = require("../src/services/skuAnalyticsService");
const {
  buildRetentionStatus,
  getSaveOfferForReason,
  shouldSendReengagementEmail
} = require("../src/services/retentionService");

test("validateSupplierPayload enforces required name and optional email", () => {
  assert.throws(() => validateSupplierPayload({ name: "" }), /Invalid name/);
  assert.throws(() => validateSupplierPayload({ name: "Urban Loom", contactEmail: "bad" }), /Invalid contactEmail/);
  const result = validateSupplierPayload({
    name: "Urban Loom",
    contactEmail: "OPS@urbanloom.test",
    defaultLeadTimeDays: 9,
    notes: "Primary apparel supplier"
  });
  assert.equal(result.name, "Urban Loom");
  assert.equal(result.contactEmail, "ops@urbanloom.test");
});

test("purchase order draft keeps only restock items and totals units", () => {
  const items = [
    { productId: "a", name: "A", supplierId: "sup-1", supplierName: "Urban Loom", suggestedReorderQty: 0, recommendedReorderQty: 0, suggestion: "SAFE" },
    { productId: "b", name: "B", supplierId: "sup-1", supplierName: "Urban Loom", recommendedReorderQty: 5, revenueAtRisk: 1200, suggestion: "RESTOCK" },
    { productId: "c", name: "C", supplierId: "sup-1", supplierName: "Urban Loom", recommendedReorderQty: 7, revenueAtRisk: 2400, suggestion: "RESTOCK" }
  ];
  const draft = buildPurchaseOrderDraft({
    supplier: { id: "sup-1", name: "Urban Loom" },
    items
  });

  assert.equal(draft.lineItems.length, 2);
  assert.equal(draft.totals.totalUnits, 12);
  assert.equal(draft.totals.totalRevenueAtRisk, 3600);
});

test("filterRestockItemsForSupplier matches supplier id first", () => {
  const items = [
    { productId: "a", supplierId: "sup-1", supplierName: "Urban Loom", suggestion: "RESTOCK" },
    { productId: "b", supplierId: "sup-2", supplierName: "Cotton Trail", suggestion: "RESTOCK" },
    { productId: "c", supplierId: "sup-1", supplierName: "Urban Loom", suggestion: "SAFE" }
  ];
  const filtered = filterRestockItemsForSupplier(items, { supplierId: "sup-1" });
  assert.deepEqual(filtered.map(item => item.productId), ["a"]);
});

test("validate purchase order and retention payloads reject invalid fields", () => {
  assert.throws(() => validatePurchaseOrderDraftPayload({ extra: true }), /Invalid purchase order field/);
  assert.throws(() => validatePurchaseOrderPatch({ status: "sent" }), /Invalid status/);
  assert.throws(() => validateRetentionRequestPayload({ reason: "bad_reason" }), /Invalid reason/);
});

test("buildSkuAnalytics returns fast and slow movers with summary", () => {
  const analytics = buildSkuAnalytics({
    products: [
      { id: "a", name: "Fast SKU", currentStock: 18 },
      { id: "b", name: "Slow SKU", currentStock: 52 }
    ],
    salesByProduct: {
      a: {
        "2026-02-21": 5, "2026-02-22": 5, "2026-02-23": 5, "2026-02-24": 5, "2026-02-25": 5, "2026-02-26": 5, "2026-02-27": 5,
        "2026-02-28": 6, "2026-03-01": 6, "2026-03-02": 6, "2026-03-03": 6, "2026-03-04": 6, "2026-03-05": 6, "2026-03-06": 6
      },
      b: {
        "2026-02-28": 1, "2026-03-01": 0, "2026-03-02": 1, "2026-03-03": 0, "2026-03-04": 0, "2026-03-05": 1, "2026-03-06": 0
      }
    },
    restockByProductId: {
      a: { daysUntilStockout: 3.2 },
      b: { daysUntilStockout: 120 }
    },
    now: new Date("2026-03-06T12:00:00.000Z")
  });

  assert.equal(analytics.summary.trackedSkus, 2);
  assert.equal(analytics.fastMovers[0].productId, "a");
  assert.equal(analytics.slowMovers[0].productId, "b");
});

test("retention helpers map reason to offer and inactivity threshold", () => {
  const offer = getSaveOfferForReason("not_using_enough");
  assert.equal(offer.type, "pause");

  const store = {
    plan: "active",
    engagement: {
      lastActiveAt: new Date("2026-02-15T00:00:00.000Z")
    },
    retention: {}
  };
  assert.equal(shouldSendReengagementEmail(store, new Date("2026-03-06T00:00:00.000Z")), true);

  const status = buildRetentionStatus(store, {
    id: "ret-1",
    type: "pause",
    reason: "seasonal",
    status: "requested",
    createdAt: { toDate: () => new Date("2026-03-05T00:00:00.000Z") },
    saveOffer: offer
  }, new Date("2026-03-06T00:00:00.000Z"));
  assert.equal(status.recommendedIntervention, "send_value_recap");
  assert.equal(status.latestRequest.type, "pause");
});
