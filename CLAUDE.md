# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Raffle ("talonario") management SPA: React 18 + TypeScript + Vite (SWC) + Tailwind/shadcn-ui, with Supabase (Postgres, Auth, one Edge Function) as the only backend. Owners create raffles and share a public link; anonymous visitors reserve numbers via WhatsApp or pay through Mercado Pago. All user-facing copy is in Spanish (Argentina); prices are in ARS.

## Commands

```bash
npm i              # install
npm run dev        # dev server on http://localhost:8080 (not 5173)
npm run build      # production build
npm run build:dev  # build in development mode
npm run lint       # eslint (no-explicit-any is a warning; errors block CI)
npm run typecheck  # tsc --noEmit -p tsconfig.app.json (vite build does not type-check)
npm run preview    # serve the production build

npm test           # all tests once (Vitest): frontend, Edge Function logic, database
npm run test:db    # only the database tests (supabase/tests/db)
npm run test:watch # watch mode
npx vitest run src/lib/payments.test.ts            # a single file
npx vitest run supabase/tests/db -t "rate limit"   # tests whose name matches
```

TypeScript is non-strict (`strict: false`, `strictNullChecks: false`, `noImplicitAny: false`), and the code uses `any` freely for Supabase rows.

### Tests

Vitest, Node environment, no browser/jsdom (config in `vitest.config.ts`). Three groups:

- `src/**/*.test.ts` — frontend units next to the code (`src/lib/payments.ts` with the Supabase client mocked via `vi.mock("@/integrations/supabase/client")` and an in-memory `localStorage`; `src/lib/validation.ts`). There are no component tests.
- `supabase/tests/db/` — the real SQL (`supabase/schema.sql` + every file in `supabase/migrations/` in filename order) run in an in-memory Postgres (PGlite). `supabase/tests/helpers/db.ts` emulates the Supabase roles (`anon`, `authenticated`, `service_role`), `auth.uid()` and default privileges; use `t.as(role, userId)` to act as a role and `t.admin(sql)` to set up or inspect data as superuser. Each test file gets its own database. Any change to grants, RLS policies or the reservation/payment SQL functions needs a test here; new migrations are picked up automatically.
- `supabase/tests/functions/` — the pure decision logic of the Edge Functions in `supabase/functions/_shared/logic.ts` (fee calculation, payment amount/currency/reference validation, webhook parsing). That file must stay free of `Deno.*` and URL imports so both Deno and Vitest can load it. The functions themselves (HTTP handlers, calls to Mercado Pago and Supabase) are **not** executed by any test.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build on pull requests and pushes to `main`.

## Environment Variables

Frontend (`.env` / `.env.local`, see `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. No Mercado Pago values live in the frontend.

Optional frontend variables (empty by default):
- `VITE_GA_MEASUREMENT_ID` — Google Analytics 4 measurement ID; GA4 is loaded only if set
- `VITE_META_PIXEL_ID` — Meta Pixel ID; the pixel is loaded only if set
- `VITE_SITE_URL` — public site URL without trailing slash, used at build time for the absolute `og:url` / `og:image` / canonical tags in `index.html` (falls back to Vercel's `VERCEL_PROJECT_PRODUCTION_URL`; see the `site-url` plugin in `vite.config.ts`)

Edge Function secrets (set in Supabase, not in Vite):
- `MP_CLIENT_ID`, `MP_CLIENT_SECRET` — Mercado Pago marketplace app
- `MP_REDIRECT_URI` — URL of the `mp-oauth-callback` function (must match the MP app config)
- `APP_URL` — public frontend URL, used for redirects and MP `back_urls`
- `MP_MARKETPLACE_FEE_PERCENT` — fallback only; the commission is read from `platform_settings` (see Mercado Pago flow)

## Architecture

### Data access: direct Supabase calls, no query layer

Pages and components call the `supabase` client (`@/integrations/supabase/client`) directly inside `useEffect` / event handlers and keep results in `useState`. After a mutation, children call an `onNumberUpdated` callback that makes `RaffleView` re-run `loadData()`.

Although they are installed (and `QueryClientProvider` is mounted in `App.tsx`), the codebase currently does **not** use TanStack Query hooks, React Hook Form, Zod, or Supabase real-time subscriptions. Forms are controlled inputs with hand-written `validateForm()` functions and the regex helpers in `src/lib/validation.ts` (`isValidEmail`, `isValidPhone`, `isValidWhatsApp`). Follow the existing style unless asked to migrate.

Feedback uses `useToast` from `@/hooks/use-toast` (`toast({ title, description, variant })`), not `sonner`.

### Auth

There is no route-guard component. Each protected page (`Dashboard`, `CreateRaffle`) calls `supabase.auth.getSession()` on mount and `navigate("/auth")` itself. `/raffle/:id` is public; `RaffleView` computes `isOwner` (`session.user.id === raffle.user_id`) and passes it down to switch between the buyer UI and the owner UI (`RaffleAdmin`, edit/finish, share image). Auth supports email/password and Google OAuth (redirects to `/dashboard`). A `handle_new_user` DB trigger creates the `profiles` row.

### Raffle numbers lifecycle

`available → reserved → (paid) → sold`

- Inserting a `raffles` row fires the `create_raffle_numbers` trigger, which generates rows `1..total_numbers` in `raffle_numbers` (the count is chosen in the create form; it is not fixed at 50).
- **Reserve**: the public has no UPDATE access to `raffle_numbers`. Anonymous visitors call the `reserve_numbers` RPC, which reserves all requested numbers or none for 24h, caps a request at 20 numbers and an IP at 40 numbers/hour (`reservation_log`).
- **paid**: set server-side when Mercado Pago confirms a payment; the owner still confirms it to `sold`.
- Owners update numbers directly (RLS policy "Owners can update their raffle numbers").
- Expired reservations are released by `clean_expired_reservations()` on a pg_cron schedule (every 10 min), and lazily inside `reserve_numbers`.
- A CHECK constraint ties status to required columns (`reserved` needs `buyer_name`, `reserved_at`, `reserved_until`; `paid`/`sold` need `buyer_name`; `available` needs it NULL), so updates must set/clear those fields together.

UI logic lives in `src/components/NumberGrid.tsx` (single and bulk flows for buyer and owner) and `src/pages/RaffleView.tsx`; server calls are wrapped in `src/lib/payments.ts`.

### Draw, prize image and draw date

- **Draw**: the owner's "Sortear ganador" button in `RaffleView` calls the `draw_raffle_winner(p_raffle_id)` RPC (owner only, once per raffle). It picks one number at random among `sold`/`paid` numbers, writes `raffles.winning_number`, `winner_display_name` (first name + last initial, never contact data) and `drawn_at`, and sets the raffle to `completed`. A CHECK constraint keeps a drawn raffle `completed`. "Finalizar" still completes a raffle without drawing; it can be drawn afterwards.
- `raffles` stays fully readable by the public, so **never add sensitive columns to it**. Writes are column-level: authenticated users can INSERT/UPDATE the form fields (`title`, `description`, `price_per_number`, `whatsapp_number`, `status`, `image_url`, `draw_date`, plus `user_id`/`total_numbers` on insert) but not the winner columns. A new editable column needs a new GRANT.
- The public page shows a winner banner; the owner also sees the winner's contact data, taken from the `get_raffle_numbers_for_owner` rows.
- **Prize image**: `raffles.image_url` points to the public Storage bucket `raffle-images` (JPG/PNG/WebP, 5 MB). Storage policies only let a user write under `<their user id>/`. Upload, validation and date helpers are in `src/lib/raffles.ts`; the picker is `src/components/RaffleImageInput.tsx` (used by `CreateRaffle` and the edit dialog).
- **Draw date**: `raffles.draw_date` is a `DATE` (`YYYY-MM-DD`); format it with `formatDrawDate()` rather than `new Date(string)`, which shifts a day in Argentina's timezone.

### What the public can read (column-level grants)

Personal data and secrets are not readable with the anon key, so **never `select("*")` on `profiles` or `raffle_numbers`** — it fails with "permission denied":
- `profiles`: only `id, created_at, full_name, mp_connected`.
- `raffle_numbers`: only `id, created_at, raffle_id, number, status, reserved_at, reserved_until, sold_at`. Owners get full rows (buyer name/email/phone, payment fields) through the `get_raffle_numbers_for_owner(p_raffle_id)` RPC, which `RaffleView.loadData()` uses when `isOwner`.
- `mp_credentials`, `mp_oauth_states`, `reservation_log`: service role only. `payment_orders`: owner SELECT only.

### Mercado Pago flow (marketplace model, all server-side)

Money goes straight to the organizer's MP account; the platform takes `marketplace_fee` on each preference. Edge Functions live in `supabase/functions/` with shared code in `_shared/mp.ts` (environment, Supabase and MP calls) and `_shared/logic.ts` (pure, unit-tested decisions):

1. **Connect** — `MercadoPagoConnect.tsx` calls `mp-oauth-start` (requires login), which stores a one-time `state` in `mp_oauth_states` and returns the MP authorization URL. `mp-oauth-callback` consumes the state, exchanges the code and upserts `mp_credentials`; a trigger mirrors it to `profiles.mp_connected`, which is what the buyer UI checks to show the pay button.
2. **Pay** — `NumberGrid` → `startMercadoPagoPayment()` → `mp-create-payment`: reserves the numbers, inserts a `payment_orders` row (amount computed from the DB price), creates the Checkout preference with the organizer's token (`external_reference = order.id`, `notification_url = mp-webhook?order=<id>`, expiring with the reservation) and returns the `init_point`. The order id is kept in `localStorage` (`pending_payment`).
3. **Confirm** — `mp-webhook` receives MP's notification, fetches the payment from the MP API (never trusts the request body), checks reference and amount, and calls the `apply_order_payment` SQL function, which marks the numbers `paid`. `mp-verify-payment` does the same on demand; `RaffleView.checkPendingPayment()` calls it when the buyer returns, as a fallback.
4. Order status `conflict` means money is involved and the organizer must act; `status_detail` says why: NULL (a number had already gone to someone else), `raffle_closed`, `amount_mismatch`, `partially_refunded`, `refunded_needs_review`, `charged_back_needs_review`. `RaffleView` lists unresolved conflicts to the owner (read from `payment_orders`, reason text in `conflictReasonText`) and "Marcar como resuelto" calls the `resolve_payment_conflict(p_order_id)` RPC, which sets `payment_orders.resolved_at` (the status stays `conflict`).
5. Refunds and chargebacks arrive through the same webhook. For an approved order on an active raffle, numbers still `paid` by that order go back to `available` and the order becomes `refunded` (final). If a number was already confirmed `sold` or the raffle is closed, nothing is touched and the order becomes a conflict for the owner to review.

**Commission**: the platform fee lives in the single-row `platform_settings.marketplace_fee_percent` table (public read, no client writes). `mp-create-payment` reads it for `marketplace_fee` and `MercadoPagoConnect` shows it to the organizer (`src/lib/platform.ts`). Change it with `UPDATE platform_settings SET marketplace_fee_percent = …`; the `MP_MARKETPLACE_FEE_PERCENT` secret is only a fallback if that row can't be read.

**Disconnecting**: `disconnect_mercadopago()` sets `mp_credentials.disconnected_at` (so `profiles.mp_connected` goes false and no new payments start) but keeps the token for 3 days so in-flight payments can still be verified; `clean_expired_reservations()` deletes it afterwards. `getSellerAccessToken()` ignores disconnected credentials unless called with `includeDisconnected` (webhook/verify).

Things to know:
- `mp-oauth-callback` and `mp-webhook` must be deployed with JWT verification off (`supabase/config.toml`).
- Access tokens are refreshed automatically by `getSellerAccessToken()` when within 7 days of expiry.
- `back_urls` / `auto_return` are only sent when `APP_URL` is https, so the return redirect can't be tested against localhost (`vite.config.ts` allows `.ngrok-free.app` hosts).
- The root-level `MERCADOPAGO_*.md`, `MP_OAUTH_IMPLEMENTATION.md`, `PAYMENT_FLOW.md` and `TESTING_PAYMENTS.md` describe the previous client-side flow and are out of date.

### Database schema and migrations

There is no migration tooling wired up; SQL is run by hand in the Supabase SQL Editor. Order for a fresh project: `supabase/schema.sql`, then `supabase/migrations/*.sql` in filename order (each file in its own run — the first adds the `paid` enum value, which Postgres won't let you use in the same transaction). The older loose files (`mercadopago_integration.sql`, `add_mp_oauth_fields.sql`, `add_paid_status.sql`, `public_reservations_policy.sql`) are superseded by the migrations; `FIX_*.sql` are one-off repair scripts.

`src/integrations/supabase/types.ts` was last updated by hand to match the migrations (not regenerated); regenerate it after schema changes.

The migrations were checked against an in-memory Postgres (PGlite), which has no `storage` schema: the Storage block of `20261116000001_product_draw.sql` is skipped there and only takes effect on a real Supabase project.

### Share image

`RaffleView.handleGenerateShareImage` draws the number grid to a `<canvas>` by hand (no library) and shares it via the Web Share API with a download fallback.

### Analytics (off by default)

`src/lib/analytics.ts` is the only place that talks to GA4 / Meta Pixel; nothing loads unless the env vars above are set. `AnalyticsTracker` (mounted inside `BrowserRouter` in `App.tsx`) sends a page view on each route change (pathname only, plus a sanitized `ref` param). Funnel events go through `track(event, params)`: `sign_up` (Auth; Google sign-ups are detected in Dashboard), `raffle_created` (CreateRaffle), `share_clicked` (RaffleView), `reservation_made` and `payment_started` (inside `src/lib/payments.ts`), `landing_cta_clicked`, `promo_footer_clicked`. **Never put personal data (names, emails, phones) in event params.**

### Link previews (Open Graph)

Social crawlers don't run JavaScript. `vercel.json` rewrites `/raffle/:id` requests whose User-Agent matches a known crawler to the Vercel Edge Function `api/raffle-preview.ts`, which returns a small HTML document with that raffle's Open Graph/Twitter tags (read from Supabase REST with the anon key: `title, description, price_per_number, status` only, all values HTML-escaped). Everyone else gets the SPA; `?_spa=1` bypasses the rewrite. The function reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` from the Vercel environment. Default social image: `public/og-image.png` (1200x630).

### Legal pages and footer

`/terminos` and `/privacidad` (`src/pages/Terminos.tsx`, `src/pages/Privacidad.tsx`, shared `LegalLayout`) are **drafts pending lawyer review** with `[PLACEHOLDERS]` for company details — don't fill those with guesses. Update the privacy policy when the data collected or third-party providers change. `SiteFooter` links both pages; with `showPromo` (non-owners on `RaffleView`) it also shows the "Creá tu rifa gratis" link to `/?ref=raffle`.

## Conventions

- `@/` aliases `src/`.
- `src/components/ui/` is shadcn/ui generated code; add components with `npx shadcn@latest add <name>` rather than hand-writing them.
- New routes go in `src/App.tsx` **above** the catch-all `*` route.
- `src/integrations/supabase/client.ts` is marked auto-generated — don't edit it.

## Deployment

Vercel; `vercel.json` rewrites all paths to `index.html` for SPA routing (after the crawler rewrite described under "Link previews") (`public/_redirects` does the same for Netlify-style hosts). See `DEPLOYMENT.md`. Topic-specific guides live at the repo root (`PAYMENT_FLOW.md`, `MERCADOPAGO_OAUTH_SETUP.md`, `TESTING_PAYMENTS.md`, `PAID_STATUS_GUIDE.md`).
