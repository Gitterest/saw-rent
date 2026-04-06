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

Use `.env.example` for key names only.

## Run

```bash
npm install
npm run dev
npm run build
npm run lint
```

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

