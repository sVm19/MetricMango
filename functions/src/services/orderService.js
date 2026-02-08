const admin = require("firebase-admin");
const { toDateKey } = require("../utils/dateUtils");

async function saveOrderFromShopify(storeId, orderPayload) {
  // Security: never trust undefined/empty storeId.
  if (!storeId) {
    throw new Error("Missing storeId");
  }
  const db = admin.firestore();
  const orderId = String(orderPayload.id || orderPayload.order_id || Date.now());
  const createdAt = orderPayload.created_at ? new Date(orderPayload.created_at) : new Date();

  const batch = db.batch();
  // Security: always scope by storeId in writes/reads to prevent cross-store access.
  const orderRef = db.collection("orders").doc(orderId);
  const existingOrder = await orderRef.get();
  if (existingOrder.exists) {
    return { orderId, duplicate: true };
  }

  const lineItems = Array.isArray(orderPayload.line_items) ? orderPayload.line_items : [];

  batch.set(orderRef, {
    storeId,
    orderId,
    createdAt: admin.firestore.Timestamp.fromDate(createdAt)
  }, { merge: true });

  for (const item of lineItems) {
    const productId = String(item.product_id || item.sku || item.id);
    const quantity = Number(item.quantity || 0);
    const price = Number(item.price || 0);
    const productName = item.title || item.name || "Unknown product";

    const orderItemRef = db.collection("orders").doc(`${orderId}_${productId}`);
    batch.set(orderItemRef, {
      storeId,
      orderId,
      productId,
      quantity,
      price,
      createdAt: admin.firestore.Timestamp.fromDate(createdAt)
    }, { merge: true });

    const productRef = db.collection("products").doc(productId);
    batch.set(productRef, {
      storeId,
      name: productName,
      currentStock: admin.firestore.FieldValue.increment(-quantity)
    }, { merge: true });

    const dateKey = toDateKey(createdAt);
    const dailyRef = db.collection("daily_sales").doc(`${storeId}_${productId}_${dateKey}`);
    batch.set(dailyRef, {
      storeId,
      productId,
      date: dateKey,
      quantitySold: admin.firestore.FieldValue.increment(quantity)
    }, { merge: true });

  }

  await batch.commit();
  return { orderId, lineItemCount: lineItems.length, duplicate: false };
}

async function getStoreOverview(storeId) {
  const db = admin.firestore();
  const ordersSnap = await db.collection("orders").where("storeId", "==", storeId).get();

  let totalRevenue = 0;
  const orderIds = new Set();
  const productTotals = {};

  ordersSnap.forEach(doc => {
    const data = doc.data();
    const key = data.productId;
    productTotals[key] = (productTotals[key] || 0) + Number(data.quantity || 0);
    totalRevenue += Number(data.price || 0) * Number(data.quantity || 0);
    if (data.orderId) orderIds.add(data.orderId);
  });

  const topProducts = Object.entries(productTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([productId, quantitySold]) => ({ productId, quantitySold }));

  return {
    totalRevenue,
    ordersCount: orderIds.size,
    topProducts
  };
}

async function getProductsWithSales(storeId, daysBack = 30) {
  const db = admin.firestore();
  const productsSnap = await db.collection("products").where("storeId", "==", storeId).get();
  const products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (daysBack - 1));
  const startKey = toDateKey(startDate);

  const results = [];
  for (const product of products) {
    const salesSnap = await db.collection("daily_sales")
      .where("storeId", "==", storeId)
      .where("productId", "==", product.id)
      .where("date", ">=", startKey)
      .get();

    let quantitySold = 0;
    salesSnap.forEach(doc => {
      quantitySold += Number(doc.data().quantitySold || 0);
    });

    results.push({
      productId: product.id,
      name: product.name || "Unknown",
      currentStock: product.currentStock || 0,
      quantitySold
    });
  }

  return results;
}

module.exports = {
  saveOrderFromShopify,
  getStoreOverview,
  getProductsWithSales
};
