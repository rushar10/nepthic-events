# Nepthic Events

`events.nepthic.com`: ticketing for Nepthic nights. It is self-contained, with its own Postgres database, customer logins, checkout and Stripe. It doesn't call Clothing, Wholesale or the gateway.

**No admin pages here.** Nepthic staff manage Events from the separate [Admin Portal](../portal) (`admin.nepthic.com`), and door staff scan tickets at `admin.nepthic.com/scan`. This site only exposes a small admin API (`POST /api/ops/v1/<op>`, in `core/ops/`) that accepts nothing but short-lived tokens signed by the portal. See [../docs/admin-api.md](../docs/admin-api.md).

## Features
- **Events.** Upcoming and past events, with ticket types and capacity.
- **Checkout and My Tickets.** Signed QR e-tickets, offline access to tickets already opened, and optional Apple and Google Wallet passes.
- **Physical tickets, partners and ticket codes.** Checkout offers e-ticket, physical or both (pickup or tracked post); partner referral links tag orders; every ticket gets a readable code in the event's format (`core/ticket-code-format.ts`, issued by `core/issue.ts`) and a separate signed QR id; print-ready PDFs (`core/print.ts`); door scans logged with gate and source. See [../docs/physical-tickets-and-partners.md](../docs/physical-tickets-and-partners.md). Sample data: `npm run db:seed-partners`.
- **Designed tickets.** Each ticket shows in its event's design, made in the Admin Portal (Events → Ticket templates) and rendered by `core/ticket-design.ts`. That file is copied byte for byte into `portal/core/`, so the editor's preview matches. Customers can download their ticket as a PNG at `/tickets/<code>/download`, which only the buyer's account can do. The QR always sits on a white panel, so every design scans; `checks/camera-scan.py` proves this with a simulated phone camera.
- **Door scanning** through the portal's scanner (`admin.nepthic.com/scan`), which checks each ticket here (`checkin.*` operations) and keeps working through short drops in connection.
- **Refunds.** Buyers request one before the cut-off, and an admin approves it before any money moves.
- **Admin, through the portal.** Dashboard, events, ticket types and capacity, refunds, check-in, customers, payments and settings (`core/ops/events.ts`).
- **Admin preview bar.** An admin who opens the site from the portal sees a bar with "Edit this event" shortcuts. Customers never receive it.

## Run locally
```sh
cp .env.example .env            # DATABASE_URL, TICKET_SIGNING_SECRET etc.
createdb nepthic_events
npm ci
npm run db:migrate
npm run db:seed                 # settings, sample events, demo customer and history
npm run dev                     # http://localhost:3002
```
Demo logins (development only):

| Account | Email | Password |
|---|---|---|
| Buyer | `jordan@example.com` | `demo-password` |

Staff, admins and door staff sign in to the portal instead (`cd ../portal && npm run db:seed-dev`).

## Environment
See `.env.example`.
- `TICKET_SIGNING_SECRET`: signs every QR code. Set it once and never change it after launch.
- `PORTAL_PUBLIC_KEY`: the Admin Portal's public key; turns on the admin API. Empty = the API answers 404.
- `PORTAL_URL`: the portal's address, used only server-side (team alert emails, the admin preview bar).
- `NEXT_PUBLIC_LOGO_HREF`: where the logo points. The default is this site's home.

**Tests.** `npm test` runs ticket signing and QR codes, glow and cursor. `npm run typecheck` runs TypeScript.
