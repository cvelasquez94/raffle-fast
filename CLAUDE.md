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

Edge Function secrets (set in Supabase, not in Vite):
- `MP_CLIENT_ID`, `MP_CLIENT_SECRET` — Mercado Pago marketplace app
- `MP_REDIRECT_URI` — URL of the `mp-oauth-callback` function (must match the MP app config)
- `APP_URL` — public frontend URL, used for redirects and MP `back_urls`
- `MP_MARKETPLACE_FEE_PERCENT` — platform commission on online payments (default `5`)

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
4. Order status `conflict` means money was received but a number had already gone to someone else; the organizer must refund or reassign.

Things to know:
- `mp-oauth-callback` and `mp-webhook` must be deployed with JWT verification off (`supabase/config.toml`).
- Access tokens are refreshed automatically by `getSellerAccessToken()` when within 7 days of expiry.
- `back_urls` / `auto_return` are only sent when `APP_URL` is https, so the return redirect can't be tested against localhost (`vite.config.ts` allows `.ngrok-free.app` hosts).
- The root-level `MERCADOPAGO_*.md`, `MP_OAUTH_IMPLEMENTATION.md`, `PAYMENT_FLOW.md` and `TESTING_PAYMENTS.md` describe the previous client-side flow and are out of date.

### Database schema and migrations

There is no migration tooling wired up; SQL is run by hand in the Supabase SQL Editor. Order for a fresh project: `supabase/schema.sql`, then `supabase/migrations/*.sql` in filename order (each file in its own run — the first adds the `paid` enum value, which Postgres won't let you use in the same transaction). The older loose files (`mercadopago_integration.sql`, `add_mp_oauth_fields.sql`, `add_paid_status.sql`, `public_reservations_policy.sql`) are superseded by the migrations; `FIX_*.sql` are one-off repair scripts.

`src/integrations/supabase/types.ts` was last updated by hand to match the migrations (not regenerated); regenerate it after schema changes.

### Share image

`RaffleView.handleGenerateShareImage` draws the number grid to a `<canvas>` by hand (no library) and shares it via the Web Share API with a download fallback.

## Conventions

- `@/` aliases `src/`.
- `src/components/ui/` is shadcn/ui generated code; add components with `npx shadcn@latest add <name>` rather than hand-writing them.
- New routes go in `src/App.tsx` **above** the catch-all `*` route.
- `src/integrations/supabase/client.ts` is marked auto-generated — don't edit it.

## Deployment

Vercel; `vercel.json` rewrites all paths to `index.html` for SPA routing (`public/_redirects` does the same for Netlify-style hosts). See `DEPLOYMENT.md`. Topic-specific guides live at the repo root (`PAYMENT_FLOW.md`, `MERCADOPAGO_OAUTH_SETUP.md`, `TESTING_PAYMENTS.md`, `PAID_STATUS_GUIDE.md`).
