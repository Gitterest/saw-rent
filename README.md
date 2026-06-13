# Saw Rent (Production App)

Full-stack chainsaw rental app with:
- public renter request + Stripe Checkout deposit flow
- protected admin operations console
- secure server-side admin/session/payment handling

## Requirements

- Node.js 20+
- Stripe account with live products/payments enabled

## Environment

Create `.env` in project root (or use your deployment provider env settings).

Public client variables:

- `VITE_API_BASE_URL` / `VITE_API_ROOT` (optional for web; defaults to `/api`)
- `VITE_ANDROID_API_BASE_URL` / `VITE_ANDROID_API_ROOT` (Android HTTPS API root; defaults to `https://soflipco.com/api`)
- `VITE_PUBLIC_APP_ORIGIN` (Android checkout return origin; defaults to `https://soflipco.com`)
- `VITE_ALLOW_LOCAL_API=true` (debug builds only, for localhost/`10.0.2.2` testing)
- `VITE_STRIPE_PUBLISHABLE_KEY` (optional; do not use secret keys here)

Server-only required variables:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

Optional:

- `PORT` (defaults to `5173`)
- `ADMIN_COOKIE_SAMESITE` (use `none` in production for Android WebView admin cookies)
- `CLIENT_ALLOWED_ORIGINS` / `MOBILE_ALLOWED_ORIGINS` (comma-separated HTTPS/native origins allowed to call the API with credentials)
- `CRYPTO_PAYMENT_EXPIRATION_MINUTES` (defaults to `30`)
- `CRYPTO_MODE=static_txid`
- `CRYPTO_DESTINATION_PROVIDER=static_txid`
- `CRYPTO_MONITORING_PROVIDER=none`
- `CRYPTO_BTC_STATIC_ADDRESS`
- `CRYPTO_XMR_STATIC_ADDRESS`

Never prefix server secrets with `VITE_`; Vite exposes `VITE_*` values to the web and Android client bundle. Use `.env.example` for key names only. See `MOBILE.md` for Android build and Play Store release steps.

## Crypto Payments

Crypto checkout is a separate BTC/XMR deposit path alongside Stripe. It uses the same rental request, admin approval, and booking conversion workflow as card deposits.

The default crypto mode uses static configured BTC and XMR receive addresses plus customer-submitted transaction hashes. Quotes still use live server-side BTC/USD and XMR/USD pricing, store the USD deposit/refund basis, and expire before stale instructions can be reused. Admin manually reviews the submitted TXID and confirms, marks underpaid, cancels, or regenerates the quote.

See `docs/crypto-wallet-setup.md` for static TXID setup and optional wallet/monitor configuration notes.

## Run

```bash
npm install
npm run dev
npm run server
npm run build
npm run lint
npm run android:sync
npm run android:build
```

## PR Checklist

The CI regression gate runs:

```bash
npm test
npm run lint
npm run build
npm run test:smoke
```

`npm run test:smoke` is the browser-level admin shell smoke suite and requires a browser-capable machine or runner. Run it locally before opening PRs that affect admin shell behavior, including boot flow, Start, taskbar, window behavior, or workspace controls.

## Stripe Webhook

Configure Stripe webhook endpoint:

- URL: `https://<your-domain>/api/webhooks/stripe`
- Event: `checkout.session.completed`

Set `STRIPE_WEBHOOK_SECRET` from Stripe for signature verification.

## App Routes

- Public renter flow: `/`
- Admin flow: `/admin`

All admin APIs are server-protected and require authenticated admin session cookies.

## Deployment Notes

1. Build frontend with `npm run build`.
2. Run server with `npm start`.
3. Ensure all env vars are configured in production.
4. Serve over HTTPS so secure cookies + Stripe checkout work correctly.

