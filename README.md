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

Required variables:

- `VITE_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

Optional:

- `PORT` (defaults to `5173`)
- `CRYPTO_PAYMENT_EXPIRATION_MINUTES` (defaults to `30`)
- `CRYPTO_MODE=static_txid`
- `CRYPTO_DESTINATION_PROVIDER=static_txid`
- `CRYPTO_MONITORING_PROVIDER=none`
- `CRYPTO_BTC_STATIC_ADDRESS`
- `CRYPTO_XMR_STATIC_ADDRESS`

Use `.env.example` for key names only.

## Crypto Payments

Crypto checkout is a separate BTC/XMR deposit path alongside Stripe. It uses the same rental request, admin approval, and booking conversion workflow as card deposits.

The default crypto mode uses static configured BTC and XMR receive addresses plus customer-submitted transaction hashes. Quotes still use live server-side BTC/USD and XMR/USD pricing, store the USD deposit/refund basis, and expire before stale instructions can be reused. Admin manually reviews the submitted TXID and confirms, marks underpaid, cancels, or regenerates the quote.

See `docs/crypto-wallet-setup.md` for static TXID setup and optional wallet/monitor configuration notes.

## Run

```bash
npm install
npm run dev
npm run build
npm run lint
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

