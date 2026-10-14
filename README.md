# Nepthic Events

`events.nepthic.com`: ticketing for Nepthic nights. It is self-contained, with its own Postgres database, logins, checkout, Stripe, admin (`/admin`) and door scanner (`/door`). It doesn't call Clothing, Wholesale or the gateway.

## Features
- **Events.** Upcoming and past events, with ticket types and capacity.
- **Checkout and My Tickets.** Signed QR e-tickets, offline access to tickets already opened, and optional Apple and Google Wallet passes.
- **Door scanner** at `/door`, for door staff on their phones.
  - It is an installable web app.
  - It checks tickets with the camera.
  - It keeps working through short drops in connection.
- **Refunds.** Buyers request one before the cut-off, and an admin approves it before any money moves.
- **Admin.**
  - Overview dashboard, events, refunds and check-in.
  - Customers, payments and settings.

## Run locally
```sh
cp .env.example .env            # DATABASE_URL, TICKET_SIGNING_SECRET etc.
createdb nepthic_events
npm ci
npm run db:migrate
npm run db:seed                 # settings, admin, sample events and history
npm run dev                     # http://localhost:3002
```
Demo logins (development only):

| Account | Email | Password |
|---|---|---|
| Admin | `admin@events.nepthic.com` | `change-me-now` |
| Staff | `staff@events.nepthic.com` | `change-me-now` |
| Door staff | `door@events.nepthic.com` | `change-me-now` |
| Buyer | `jordan@example.com` | `demo-password` |

## Environment
See `.env.example`.
- `TICKET_SIGNING_SECRET`: signs every QR code. Set it once and never change it after launch.
- `OVERVIEW_API_TOKEN`: turns on the read-only `/api/overview/summary`.
- `NEXT_PUBLIC_LOGO_HREF`: where the logo points. The default is this site's home.

**Tests.** `npm test` runs ticket signing and QR codes, glow and cursor. `npm run typecheck` runs TypeScript.
