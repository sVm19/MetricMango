import React from "react";

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value || 0);
}

export default function ProductTable({ rows, emptyLabel }) {
  if (!rows || rows.length === 0) {
    return <div className="empty">{emptyLabel}</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Price</th>
            <th>Stock</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className={row.currentStock <= 5 ? "low-stock" : ""}>
              <td>{row.name}</td>
              <td>{formatMoney(row.price)}</td>
              <td>{row.currentStock}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
