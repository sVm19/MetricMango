function formatMoney(value) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
    }).format(value || 0);
}

function formatPercent(value) {
    const numeric = Number(value || 0);
    const sign = numeric > 0 ? "+" : "";
    return `${sign}${numeric.toFixed(1)}%`;
}

function buildWeeklyReportHtml(storeName, summary, dashboardUrl) {
    const { totalWeeklyRevenue, totalOrders, revenueGrowthPercent, bestSellingProduct } = summary;

    const growthColor = revenueGrowthPercent >= 0 ? "#10b981" : "#ef4444";
    const bspName = bestSellingProduct ? bestSellingProduct.name : "None recorded";
    const bspQty = bestSellingProduct ? bestSellingProduct.quantitySold : "0";

    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background-color: #f9fafb;
    color: #111827;
    margin: 0;
    padding: 0;
    -webkit-font-smoothing: antialiased;
  }
  .wrapper {
    width: 100%;
    table-layout: fixed;
    background-color: #f9fafb;
    padding: 40px 0;
  }
  .main-container {
    max-width: 600px;
    margin: 0 auto;
    background-color: #ffffff;
    border-radius: 12px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    overflow: hidden;
  }
  .header {
    background-color: #f59e0b; /* Brand Mango Orange */
    padding: 32px 40px;
    text-align: center;
  }
  .header h1 {
    margin: 0;
    color: #ffffff;
    font-size: 24px;
    font-weight: 700;
  }
  .header p {
    margin: 8px 0 0 0;
    color: #fef3c7;
    font-size: 14px;
  }
  .content {
    padding: 40px;
  }
  .greeting {
    font-size: 18px;
    margin-bottom: 32px;
    color: #374151;
  }
  .metric-grid {
    display: table;
    width: 100%;
    margin-bottom: 24px;
  }
  .metric-card {
    display: table-cell;
    width: 50%;
    padding: 20px;
    background-color: #f3f4f6;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
  }
  .metric-card-left {
    border-right: 8px solid #ffffff; /* Simulated gap */
  }
  .metric-card-right {
    border-left: 8px solid #ffffff;
  }
  .metric-label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7280;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .metric-value {
    font-size: 32px;
    font-weight: 700;
    color: #111827;
    margin: 0;
  }
  .metric-trend {
    font-size: 14px;
    font-weight: 600;
    margin-top: 6px;
  }
  .highlight-box {
    background-color: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 8px;
    padding: 24px;
    margin-top: 24px;
    margin-bottom: 32px;
  }
  .highlight-title {
    font-size: 14px;
    color: #d97706;
    font-weight: 600;
    margin-bottom: 8px;
    margin-top: 0;
  }
  .highlight-stat {
    font-size: 18px;
    color: #92400e;
    font-weight: 700;
    margin: 0;
  }
  .btn-container {
    text-align: center;
    margin-top: 40px;
  }
  .btn {
    display: inline-block;
    background-color: #111827;
    color: #ffffff;
    text-decoration: none;
    padding: 14px 32px;
    border-radius: 6px;
    font-weight: 600;
    font-size: 16px;
  }
  .footer {
    padding: 32px 40px;
    text-align: center;
    background-color: #f9fafb;
    border-top: 1px solid #e5e7eb;
  }
  .footer p {
    font-size: 13px;
    color: #6b7280;
    margin: 0 0 12px 0;
  }
  .footer a {
    color: #9ca3af;
    text-decoration: underline;
  }
  
  /* Mobile Responsiveness */
  @media only screen and (max-width: 600px) {
    .metric-card {
      display: block;
      width: 100%;
      box-sizing: border-box;
    }
    .metric-card-left {
      border-right: none;
      margin-bottom: 16px;
    }
    .metric-card-right {
      border-left: none;
    }
    .content, .header, .footer {
      padding: 24px;
    }
  }
</style>
</head>
<body>
  <div class="wrapper">
    <div class="main-container">
      <!-- Header -->
      <div class="header">
        <h1>MetricMango Weekly Report</h1>
        <p>${storeName}</p>
      </div>
      
      <!-- Content -->
      <div class="content">
        <div class="greeting">
          Here is your store's performance recap for the past 7 days.
        </div>
        
        <!-- Metrics -->
        <div class="metric-grid">
          <div class="metric-card metric-card-left">
            <div class="metric-label">Weekly Revenue</div>
            <div class="metric-value">${formatMoney(totalWeeklyRevenue)}</div>
            <div class="metric-trend" style="color: ${growthColor}">
              ${formatPercent(revenueGrowthPercent)} vs last week
            </div>
          </div>
          <div class="metric-card metric-card-right">
            <div class="metric-label">Total Orders</div>
            <div class="metric-value">${totalOrders}</div>
          </div>
        </div>

        <!-- Best Seller -->
        <div class="highlight-box">
          <p class="highlight-title">⭐ Top Selling Product</p>
          <p class="highlight-stat">${bspName} &mdash; ${bspQty} Units Sold</p>
        </div>

        <!-- Call To Action -->
        <div class="btn-container">
          <a href="${dashboardUrl}" class="btn">View Full Dashboard</a>
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p>You received this email because you are subscribed to MetricMango analytics reports.</p>
        <p><a href="${dashboardUrl}/settings/alerts">Manage Alert Preferences</a> or <a href="${dashboardUrl}/settings/alerts">Unsubscribe</a></p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

module.exports = {
    buildWeeklyReportHtml
};
