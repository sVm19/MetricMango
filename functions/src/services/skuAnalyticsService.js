function roundToTwo(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDateRangeKeys(referenceDate, daysBack) {
  const keys = [];
  const cursor = new Date(referenceDate);
  for (let index = daysBack - 1; index >= 0; index -= 1) {
    const next = new Date(cursor);
    next.setDate(cursor.getDate() - index);
    keys.push(toDateKey(next));
  }
  return keys;
}

function sumForKeys(dailyMap = {}, keys = []) {
  return keys.reduce((sum, key) => sum + Number(dailyMap[key] || 0), 0);
}

function trendDirectionFromPercent(value) {
  if (value >= 10) return "up";
  if (value <= -10) return "down";
  return "flat";
}

function velocityBandFromAverage(avgDailySales) {
  if (avgDailySales >= 5) return "fast";
  if (avgDailySales >= 1.5) return "steady";
  if (avgDailySales > 0) return "slow";
  return "inactive";
}

function buildSkuAnalytics({ products = [], salesByProduct = {}, restockByProductId = {}, now = new Date() } = {}) {
  const keys30 = buildDateRangeKeys(now, 30);
  const keys14 = keys30.slice(-14);
  const current7Keys = keys14.slice(-7);
  const previous7Keys = keys14.slice(0, 7);

  const rows = products.map(product => {
    const productId = String(product.id || product.productId || "");
    const dailyMap = salesByProduct[productId] || {};
    const sold7 = sumForKeys(dailyMap, current7Keys);
    const sold30 = sumForKeys(dailyMap, keys30);
    const previous7 = sumForKeys(dailyMap, previous7Keys);
    const avgDailySales7 = roundToTwo(sold7 / 7);
    const avgDailySales30 = roundToTwo(sold30 / 30);
    const currentStock = Number(product.currentStock || 0);
    const denominator = currentStock + sold30;
    const sellThroughRate30 = denominator > 0 ? roundToTwo((sold30 / denominator) * 100) : 0;
    const trendPercent = previous7 > 0 ? roundToTwo(((sold7 - previous7) / previous7) * 100) : (sold7 > 0 ? 100 : 0);
    const restock = restockByProductId[productId] || {};
    const stockCoverDays = Number.isFinite(Number(restock.daysUntilStockout))
      ? Number(restock.daysUntilStockout)
      : (avgDailySales7 > 0 ? roundToTwo(currentStock / avgDailySales7) : Number.POSITIVE_INFINITY);

    return {
      productId,
      name: String(product.name || "").trim(),
      currentStock,
      sold7,
      sold30,
      avgDailySales7,
      avgDailySales30,
      sellThroughRate30,
      stockCoverDays,
      trendPercent,
      trendDirection: trendDirectionFromPercent(trendPercent),
      velocityBand: velocityBandFromAverage(avgDailySales7)
    };
  });

  const fastMovers = [...rows]
    .filter(item => item.velocityBand === "fast" || item.velocityBand === "steady")
    .sort((first, second) => second.avgDailySales7 - first.avgDailySales7)
    .slice(0, 5);

  const slowMovers = [...rows]
    .filter(item => item.velocityBand === "slow" || item.velocityBand === "inactive")
    .sort((first, second) => first.avgDailySales7 - second.avgDailySales7)
    .slice(0, 5);

  const summary = rows.reduce((acc, item) => {
    acc.avgSellThroughRate30 += Number(item.sellThroughRate30 || 0);
    acc.avgStockCoverDays += Number.isFinite(item.stockCoverDays) ? Number(item.stockCoverDays) : 0;
    acc.trackedSkus += 1;
    if (item.trendDirection === "up") acc.growingSkus += 1;
    if (item.trendDirection === "down") acc.slippingSkus += 1;
    return acc;
  }, {
    avgSellThroughRate30: 0,
    avgStockCoverDays: 0,
    trackedSkus: 0,
    growingSkus: 0,
    slippingSkus: 0
  });

  if (summary.trackedSkus > 0) {
    summary.avgSellThroughRate30 = roundToTwo(summary.avgSellThroughRate30 / summary.trackedSkus);
    summary.avgStockCoverDays = roundToTwo(summary.avgStockCoverDays / summary.trackedSkus);
  }

  return {
    generatedAt: now.toISOString(),
    summary,
    fastMovers,
    slowMovers,
    rows
  };
}

module.exports = {
  buildSkuAnalytics,
  trendDirectionFromPercent,
  velocityBandFromAverage
};
