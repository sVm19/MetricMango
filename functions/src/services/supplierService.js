function normalizeSupplierRecord(doc) {
  const source = typeof doc.data === "function" ? { id: doc.id, ...doc.data() } : doc;
  return {
    id: String(source?.id || ""),
    storeId: String(source?.storeId || ""),
    name: String(source?.name || "").trim(),
    contactEmail: String(source?.contactEmail || "").trim().toLowerCase(),
    defaultLeadTimeDays: Number(source?.defaultLeadTimeDays || 7),
    notes: String(source?.notes || "").trim(),
    linkedProductCount: Number(source?.linkedProductCount || 0),
    linkedProducts: Array.isArray(source?.linkedProducts) ? source.linkedProducts : []
  };
}

function attachSupplierLinks(suppliers = [], products = []) {
  return suppliers.map(supplier => {
    const linkedProducts = products.filter(product => {
      const supplierId = String(product?.supplierId || "").trim();
      const supplierName = String(product?.supplierName || "").trim().toLowerCase();
      return supplierId === supplier.id || (!supplierId && supplierName && supplierName === supplier.name.toLowerCase());
    });

    return {
      ...supplier,
      linkedProductCount: linkedProducts.length,
      linkedProducts: linkedProducts.slice(0, 10).map(product => ({
        productId: String(product.id || product.productId || ""),
        name: String(product.name || "").trim()
      }))
    };
  }).sort((first, second) => first.name.localeCompare(second.name));
}

module.exports = {
  attachSupplierLinks,
  normalizeSupplierRecord
};
