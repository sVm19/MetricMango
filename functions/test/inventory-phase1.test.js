const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveInventorySettings,
  validateInventorySettingsPatch
} = require("../src/services/inventorySettingsService");
const { buildRestockSuggestion } = require("../src/services/restockService");
const { isLowStockSuggestion } = require("../src/services/lowStockAlertService");
const { computeSalesSpikeCandidates } = require("../src/services/salesSpikeAlertService");
const { buildWeeklyActionPlan } = require("../src/services/weeklyActionPlanService");

test("resolveInventorySettings falls back to defaults and store email", () => {
  const result = resolveInventorySettings({ email: "Owner@Example.com" });
  assert.equal(result.lowStockAlertsEnabled, true);
  assert.equal(result.lowStockThresholdDays, 5);
  assert.equal(result.alertRecipientEmail, "owner@example.com");
  assert.equal(result.defaultLeadTimeDays, 7);
});

test("validateInventorySettingsPatch rejects invalid values", () => {
  assert.throws(
    () => validateInventorySettingsPatch({ lowStockThresholdDays: 0 }),
    /Invalid lowStockThresholdDays/
  );
  assert.throws(
    () => validateInventorySettingsPatch({ alertRecipientEmail: "bad-email" }),
    /Invalid alertRecipientEmail/
  );
});

test("buildRestockSuggestion applies product lead time and safety buffer", () => {
  const suggestion = buildRestockSuggestion({
    product: {
      id: "sku-1",
      name: "SKU 1",
      currentStock: 10,
      price: 250,
      leadTimeDays: 10
    },
    dailyMap: {
      "2026-03-01": 2,
      "2026-03-02": 2,
      "2026-03-03": 2,
      "2026-03-04": 2,
      "2026-03-05": 2,
      "2026-03-06": 2,
      "2026-03-07": 2
    },
    rangeKeys: [
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07"
    ],
    storeSettings: {
      defaultLeadTimeDays: 7,
      safetyBufferDays: 2
    }
  });

  assert.equal(suggestion.leadTimeDays, 10);
  assert.equal(suggestion.planningWindowDays, 12);
  assert.equal(suggestion.expectedDemand, 24);
  assert.equal(suggestion.recommendedReorderQty, 14);
  assert.equal(suggestion.revenueAtRisk, 3500);
  assert.equal(suggestion.suggestion, "RESTOCK");
});

test("buildRestockSuggestion stays SAFE when there is no sales velocity", () => {
  const suggestion = buildRestockSuggestion({
    product: {
      id: "sku-2",
      currentStock: 20,
      price: 100
    },
    dailyMap: {},
    rangeKeys: [
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07"
    ],
    storeSettings: {
      defaultLeadTimeDays: 7,
      safetyBufferDays: 0
    }
  });

  assert.equal(suggestion.avgDailySales, 0);
  assert.equal(suggestion.recommendedReorderQty, 0);
  assert.equal(suggestion.suggestion, "SAFE");
});

test("isLowStockSuggestion matches days or units threshold", () => {
  const byDays = isLowStockSuggestion({
    daysUntilStockout: 4,
    currentStock: 50
  }, {
    lowStockThresholdDays: 5,
    lowStockThresholdUnits: null
  });
  const byUnits = isLowStockSuggestion({
    daysUntilStockout: 9,
    currentStock: 3
  }, {
    lowStockThresholdDays: 5,
    lowStockThresholdUnits: 5
  });

  assert.equal(byDays, true);
  assert.equal(byUnits, true);
});

test("computeSalesSpikeCandidates flags spikes only when baseline is meaningful", () => {
  const todayKey = "2026-03-06";
  const candidates = computeSalesSpikeCandidates({
    todayKey,
    dateKeys: [
      "2026-02-26",
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05"
    ],
    settings: {
      salesSpikeAlertsEnabled: true,
      salesSpikeThresholdPercent: 30
    },
    products: [
      { id: "sku-1", name: "SKU 1" },
      { id: "sku-2", name: "SKU 2", lastSalesSpikeAlertDate: todayKey }
    ],
    salesByProduct: {
      "sku-1": {
        "2026-02-27": 2,
        "2026-02-28": 2,
        "2026-03-01": 2,
        "2026-03-02": 2,
        "2026-03-03": 2,
        "2026-03-04": 2,
        "2026-03-05": 5
      },
      "sku-2": {
        "2026-02-27": 2,
        "2026-02-28": 2,
        "2026-03-01": 2,
        "2026-03-02": 2,
        "2026-03-03": 2,
        "2026-03-04": 2,
        "2026-03-05": 6
      }
    }
  });

  assert.equal(candidates[0].triggered, true);
  assert.equal(candidates[1].triggered, false);
});

test("buildWeeklyActionPlan sorts by revenue at risk then stock cover", () => {
  const result = buildWeeklyActionPlan([
    { productId: "a", suggestion: "RESTOCK", revenueAtRisk: 500, recommendedReorderQty: 2, daysUntilStockout: 6 },
    { productId: "b", suggestion: "RESTOCK", revenueAtRisk: 500, recommendedReorderQty: 5, daysUntilStockout: 3 },
    { productId: "c", suggestion: "RESTOCK", revenueAtRisk: 900, recommendedReorderQty: 4, daysUntilStockout: 10 },
    { productId: "d", suggestion: "SAFE", revenueAtRisk: 1500, recommendedReorderQty: 7, daysUntilStockout: 1 }
  ]);

  assert.deepEqual(result.items.map(item => item.productId), ["c", "b", "a"]);
  assert.equal(result.totals.atRiskSkus, 3);
  assert.equal(result.totals.requiredUnits, 11);
  assert.equal(result.totals.revenueAtRisk, 1900);
});
