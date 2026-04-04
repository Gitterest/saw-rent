# Saw Rent

Production-oriented full-stack rental system for chainsaw inventory, booking intake, and owner administration.

## Stack

- Frontend: React + Vite
- Backend API: Node + Express
- Persistence: JSON file at `data/store.json`
- Auth: owner password from env + signed `HttpOnly` session cookie

## Environment Setup

Create `.env` (or export variables in your shell):

```bash
OWNER_PASSWORD=replace-with-strong-password
SESSION_SECRET=replace-with-long-random-secret
PORT=4000
```

## Run Locally

```bash
npm install
npm run dev
```

- Public site: `http://localhost:5173/`
- Admin console: `http://localhost:5173/admin`
- API: `http://localhost:4000/api/health`

## Admin API Security

- `POST /api/admin/login` verifies `OWNER_PASSWORD`.
- Server issues a signed, tamper-resistant cookie session.
- All `/api/admin/*` routes require valid session middleware.

## Data Model

Persisted entities in `data/store.json`:

- `inventory`
- `bookings`
- `customers`
- `settings`

## Booking and Availability Rules

- Public requests create `requested` bookings.
- Only `requested/approved/checked_out` block date overlap.
- Maintenance lock prevents approval and public booking requests.
- Lifecycle statuses: `requested -> approved -> checked_out -> returned -> closed` (+ `cancelled`).
- Closing a booking updates or creates the related customer record.

## Quality Checks

```bash
npm run lint
npm run build
```
