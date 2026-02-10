# Metric Mango

Metric Mango is a lightweight backend-first SaaS API built for small ecommerce teams (Shopify, D2C sellers). It provides basic sales analytics, revenue dashboards, simple forecasting, and restock suggestions. One plan. All features. No tiers. No upsells.

## What's Included
- Firebase Functions (Node.js) API
- Firestore data model
- Minimal React dashboard (Vite)
- Lemon Squeezy billing (plan status synced via webhook)

## Folder Structure
- `functions/` Firebase Functions backend
- `dashboard/` React dashboard

## Firestore Data Model
- `stores/{storeId}`
  - `name`, `plan`, `billingProvider`, `shopCountry`, `country`, `createdAt`, `apiKey`, `email`, `alertEmail`, `trialStartAt`, `trialExpiredAt`, `lastLowStockAlertDate`, `lastLowStockAlertAt`, `features`, `lemonSqueezyVariantId`, `razorpaySubscriptionId`, `razorpayPlanId`
- `orders/{orderId}`
  - `storeId`, `orderId`, `productId`, `quantity`, `price`, `createdAt`
- `products/{productId}`
  - `storeId`, `name`, `currentStock`
- `daily_sales/{storeId_productId_date}`
  - `storeId`, `productId`, `date`, `quantitySold`

## API Endpoints
- `POST /webhook/shopify/order-created`
- `POST /webhook/lemonsqueezy`
- `POST /webhook/razorpay`
- `GET /pricing`
- `GET /dashboard/overview`
- `GET /dashboard/products`
- `GET /forecast`
- `GET /restock-suggestions`
- `GET /alerts/low-stock`
- `GET /export/orders`
- `GET /export/products`
- `POST /billing/razorpay/subscribe`
- `GET /billing/lemonsqueezy/checkout`

## API Authentication (MVP)
Use an API key stored on the store document.
- Send via `Authorization: Bearer <apiKey>` (or just the raw key)
- The API key maps to a store and sets `storeId` on the request
- Unauthorized requests return `401`

## Low Stock Email Alerts
The low stock alert endpoint checks products and emails the store owner when stock is likely to run out soon.
- Endpoint: `GET /alerts/low-stock`
- Default threshold: 5 days (override with `?thresholdDays=3`)
- Uses 7-day average daily sales and current stock
- Sends at most one email per product per day
- Alert recipient: `stores/{storeId}.alertEmail` (falls back to `stores/{storeId}.email`)

## CSV Exports
Download store data for Excel without using the dashboard.
- Orders: `GET /export/orders`
- Products: `GET /export/products`
- Optional `?limit=500` (max 1000) to keep exports MVP-safe
 - Orders export contains one row per line item (orderId + productId)

All dashboard/forecast endpoints require `storeId` and a store with `plan` set to `active` or `paid`.

## Local Development

### 1) Install dependencies

```
cd functions
npm install

cd ../dashboard
npm install
```

### 2) Configure environment

Copy and edit env files:
- `functions/.env.example` -> `functions/.env`
- `dashboard/.env.example` -> `dashboard/.env`

Alert email settings (Resend):
- `RESEND_API_KEY`
- `RESEND_FROM` (example: `Metric Mango <alerts@metricmango.com>`)

Billing settings (Lemon Squeezy):
- `LEMON_SQUEEZY_STORE_ID`
- `LEMON_SQUEEZY_API_KEY`
- `LEMON_SQUEEZY_WEBHOOK_SECRET`

Billing settings (Razorpay):
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RAZORPAY_PLAN_ID`

### Production Config (Firebase Functions)
Secrets must never be bundled into the frontend. This backend now reads config from environment variables (`process.env`) only.

For local dev:
- keep values in `functions/.env` (copy from `functions/.env.example`)

For production deploy:
- set variables in your deploy environment (CI/CD or shell before running `firebase deploy`)
- keep sensitive values in Google Secret Manager if required by your security policy

Example (PowerShell):
```powershell
$env:LEMON_SQUEEZY_STORE_ID="..."
$env:LEMON_SQUEEZY_API_KEY="..."
$env:LEMON_SQUEEZY_WEBHOOK_SECRET="..."
$env:RAZORPAY_KEY_ID="..."
$env:RAZORPAY_KEY_SECRET="..."
$env:RAZORPAY_WEBHOOK_SECRET="..."
$env:RAZORPAY_PLAN_ID="..."
$env:SHOPIFY_WEBHOOK_SECRET="..."
$env:RESEND_API_KEY="..."
$env:RESEND_FROM="Metric Mango <alerts@metricmango.com>"
firebase deploy --only functions
```

### 3) Run Firebase Functions locally

```
cd functions
npm run serve
```

### 4) Run the React dashboard

```
cd dashboard
npm run dev
```

## Deploy Firebase Functions

```
cd functions
npm run deploy
```

## Shopify Webhook Flow
1. Shopify sends order payload to `POST /webhook/shopify/order-created`
2. The function stores order line items
3. `daily_sales` is updated per product per day
4. Dashboard + forecast endpoints compute analytics on request

TODO: Verify Shopify webhook signature before processing.

## Subscription Logic (Razorpay)
## Subscription Logic (Lemon Squeezy)
- Pricing and billing are configured in Lemon Squeezy
- Webhook updates `stores/{storeId}.plan` to `active | inactive | trial`
- Middleware blocks access if subscription is inactive or trial expired
- Webhook expects `storeId` in Lemon Squeezy `custom_data` to map subscriptions

TODO: Add reminder email before trial expiry

## Pricing
Pricing is centralized in `functions/src/config/pricing.js` and should be referenced by billing flows.
- One plan. All features.
- 7 days free. Then ₹499/month (India) or $9/month (global).
- No tiers. No upsells.
- India: INR 499/month
- Global: USD 9/month

## Dual Billing Providers (MVP)
Metric Mango can support multiple payment providers without duplicating business logic.
- `stores/{storeId}.billingProvider` decides which billing system controls `stores.plan`
  - `lemonsqueezy` for global stores
  - `razorpay` for India (IN/INR)
- The backend decides the provider at onboarding time and persists it on the store document (MVP uses a simple IN/INR heuristic if not set)
- The frontend never decides payment provider
- `subscriptionGate` remains provider-agnostic and only checks `stores.plan`
- Billing webhooks only update `stores.plan` to keep core features decoupled from providers

## Store Onboarding (Country Detection)
- On first store creation, the backend detects country:
  - Shopify store country (preferred)
  - Fallback to user-selected country
- If country is `IN` → `billingProvider = razorpay`, else `billingProvider = lemonsqueezy`
- `plan` is initialized to `trial` and `trialStartAt` is set

## Razorpay Subscriptions (India)
- Create a subscription with `POST /billing/razorpay/subscribe` (uses `RAZORPAY_PLAN_ID` from environment config)
- Webhook updates `stores.plan` on `subscription_activated`, `subscription_cancelled`, `subscription_expired`
- Razorpay Checkout supports UPI + cards; backend only creates the subscription

## Lemon Squeezy Checkout (Global)
- Create a checkout session with `GET /billing/lemonsqueezy/checkout`
- Requires `stores/{storeId}.lemonSqueezyVariantId`
- The backend redirects the user to the Lemon Squeezy hosted checkout
- Optional `?json=1` returns `{ checkoutUrl }` instead of redirect
- Lemon Squeezy handles taxes and invoices

## Notes
- Forecasting uses moving averages (7/14/30 days)
- Forecasts are cached per store and recomputed once per day
- Restock suggestions use 7-day average and a configurable lead time
 - New stores get a 7-day trial (`plan = trial`) before needing an active plan

## Feature Flags (MVP)
Store-level feature flags live in `stores/{storeId}.features`.
Example:
```
features: {
  emailAlerts: true,
  csvExport: true,
  forecasting: true
}
```
If a flag is missing, the feature is treated as enabled.

## Frontend Guidance: Restock Suggestions
Keep the messaging simple and helpful for store owners.
- `RESTOCK` means show a red/warning state and prompt to add stock soon
- `SAFE` means show a green/ok state and reassure stock looks sufficient
- Always show “Expected demand” next to “Current stock” so the advice feels transparent
- Use plain language like “expected to sell” and “stock on hand”

## MVP TODOs
- Verify Shopify webhook signatures
- Add Razorpay webhook processing
- Add basic auth (Shopify shop validation)
- Improve order schema (separate orders vs order items)
- Add pagination for larger stores

---
Built to ship fast and stay simple.
