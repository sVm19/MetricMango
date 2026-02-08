const express = require("express");
const admin = require("firebase-admin");
const { dateRangeKeys } = require("../utils/dateUtils");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { storeId } = req;
    if (!storeId) {
      return res.status(400).json({ error: "Missing storeId" });
    }
    const db = admin.firestore();

    // TODO: Consider daily cached forecasts per store to reduce reads.
    // Security: always scope queries by storeId to prevent cross-store access.
    const productsSnap = await db.collection("products").where("storeId", "==", storeId).get();
    const productIds = productsSnap.docs.map(doc => doc.id);

    const range30 = dateRangeKeys(30);
    const range14 = range30.slice(30 - 14);
    const range7 = range30.slice(30 - 7);

    // Security: always scope queries by storeId to prevent cross-store access.
    const salesSnap = await db.collection("daily_sales")
      .where("storeId", "==", storeId)
      .where("date", ">=", range30[0])
      .get();

    const salesByProduct = {};
    salesSnap.forEach(doc => {
      const data = doc.data();
      const productId = String(data.productId);
      if (!salesByProduct[productId]) salesByProduct[productId] = {};
      salesByProduct[productId][data.date] = Number(data.quantitySold || 0);
    });

    const results = productIds.map(productId => {
      const dailyMap = salesByProduct[productId] || {};
      const sumRange = keys => keys.reduce((sum, key) => sum + Number(dailyMap[key] || 0), 0);

      const total7 = sumRange(range7);
      const total14 = sumRange(range14);
      const total30 = sumRange(range30);

      const ma7 = total7 / 7;
      const ma14 = total14 / 14;
      const ma30 = total30 / 30;

      return {
        productId,
        forecast: {
          ma7,
          ma14,
          ma30,
          next7Days: ma7 * 7
        }
      };
    });

    return res.json({ data: results });
  } catch (error) {
    console.error("Forecast error:", error);
    return res.status(500).json({ error: "Failed to compute forecast" });
  }
});

module.exports = router;
