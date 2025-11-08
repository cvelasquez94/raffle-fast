# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a raffle management application built with React, TypeScript, Vite, and Supabase. The application allows users to create raffles, manage raffle numbers, track purchases, and administer raffle events. This project was initially created with Lovable (lovable.dev) and uses shadcn/ui for UI components.

## Development Commands

```bash
# Install dependencies
npm i

# Start development server (runs on port 8080)
npm run dev

# Build for production
npm run build

# Build for development environment
npm run build:dev

# Lint code
npm run lint

# Preview production build
npm preview
```

## Tech Stack

- **Frontend Framework**: React 18 with TypeScript
- **Build Tool**: Vite with SWC plugin for fast compilation
- **Styling**: Tailwind CSS with shadcn/ui components
- **Backend/Database**: Supabase (authentication, database, real-time subscriptions)
- **State Management**: TanStack Query (React Query) for server state
- **Form Handling**: React Hook Form with Zod validation
- **Routing**: React Router v6
- **UI Components**: Radix UI primitives via shadcn/ui

## Architecture

### Application Structure

```
src/
├── components/         # Reusable components
│   ├── ui/            # shadcn/ui components (auto-generated)
│   ├── Navbar.tsx     # Main navigation component
│   ├── NumberGrid.tsx # Grid for displaying/selecting raffle numbers
│   ├── RaffleAdmin.tsx # Admin panel for managing raffle numbers
│   └── RaffleCard.tsx # Card component for displaying raffle info
├── pages/             # Route components (page-level)
│   ├── Index.tsx      # Landing page
│   ├── Auth.tsx       # Authentication page
│   ├── Dashboard.tsx  # User dashboard
│   ├── CreateRaffle.tsx # Raffle creation form
│   ├── RaffleView.tsx # Individual raffle view/management
│   └── NotFound.tsx   # 404 page
├── hooks/             # Custom React hooks
├── integrations/
│   └── supabase/      # Supabase client and generated types
├── lib/               # Utility functions
└── App.tsx            # Root component with providers and routing
```

### Key Architectural Patterns

**Database Schema** (Supabase):
- `profiles` - User profile information (linked to auth.users)
- `raffles` - Raffle events (title, description, price, whatsapp contact)
- `raffle_numbers` - Individual raffle numbers with status tracking (available, reserved, sold)

**Number Status Flow**: available → reserved (with reserved_until timestamp) → sold

**Authentication Flow**:
- Supabase Auth handles authentication
- Session is persisted in localStorage
- Protected routes check session and redirect to `/auth` if not authenticated
- User profiles are created/linked with auth users

**State Management**:
- TanStack Query for server state caching and synchronization
- Local component state for UI interactions
- Supabase real-time subscriptions for live updates (in RaffleView)

### Path Aliases

The project uses TypeScript path aliases configured in `vite.config.ts` and `tsconfig.json`:
- `@/` → `src/` (e.g., `@/components/ui/button`)

### Routing

Routes are defined in [src/App.tsx](src/App.tsx):
- `/` - Landing page
- `/auth` - Authentication
- `/dashboard` - User's raffles dashboard
- `/create-raffle` - Create new raffle
- `/raffle/:id` - View/manage specific raffle
- Custom routes must be added ABOVE the catch-all `*` route

## Environment Variables

Required Supabase environment variables (set via Vite's `VITE_` prefix):
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Supabase anon/public key

These are accessed via `import.meta.env` in [src/integrations/supabase/client.ts](src/integrations/supabase/client.ts).

## UI Component System

This project uses shadcn/ui, which means:
- UI components are in `src/components/ui/` and are directly part of the codebase (not npm packages)
- Components use Radix UI primitives with Tailwind CSS styling
- The `cn()` utility from `src/lib/utils.ts` is used for conditional class merging
- Component configuration is in `components.json`
- To add new shadcn components, use: `npx shadcn@latest add [component-name]`

## Supabase Integration

**Setup**: Complete database schema and setup instructions are in `supabase/` folder:
- `supabase/schema.sql` - Complete database schema with tables, policies, triggers
- `supabase/seed_data.sql` - Optional test data
- `supabase/verification.sql` - Verification script to test setup
- `supabase/README.md` - Detailed setup guide

**Client**: Singleton Supabase client is exported from `@/integrations/supabase/client`

**Types**: Auto-generated database types are in `@/integrations/supabase/types` - these should be regenerated when database schema changes

**Auth**: Configured with localStorage persistence and auto token refresh

**Public Reservations**: The application allows unauthenticated users to reserve raffle numbers through Row Level Security (RLS) policies that permit public UPDATE operations on `raffle_numbers` when changing status from `available` to `reserved`.

**Usage Pattern**:
```typescript
import { supabase } from "@/integrations/supabase/client";

// Query data
const { data, error } = await supabase
  .from('raffles')
  .select('*')
  .eq('user_id', userId);

// Real-time subscriptions
supabase
  .channel('raffle-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'raffle_numbers' }, handler)
  .subscribe();
```

**Database Schema**:
- Tables automatically create profiles via `on_auth_user_created` trigger
- Raffle numbers (1-50) are auto-generated when a raffle is created
- Expired reservations can be cleaned with `SELECT clean_expired_reservations();`

## Development Workflow

When adding new features:
1. Create/modify page components in `src/pages/` for route-level views
2. Create reusable components in `src/components/`
3. Use shadcn/ui components from `src/components/ui/` as building blocks
4. For forms, use React Hook Form with Zod schemas
5. Use TanStack Query hooks for data fetching/mutations
6. Add route to `src/App.tsx` if creating new pages
7. Supabase types may need regeneration if schema changes

## Deployment

**Vercel Configuration**: See [DEPLOYMENT.md](DEPLOYMENT.md) for complete deployment guide.

**Key files**:
- `vercel.json` - Configures SPA routing (fixes 404 on direct route access)
- `public/_redirects` - Alternative config for Netlify/other hosts

**Environment Variables** (must be set in Vercel):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

**Common Issues**:
- 404 on direct routes → Ensure `vercel.json` is deployed
- Supabase errors → Verify environment variables in Vercel
- Build failures → Run `npm run build` locally first

## Important Notes

- Development server runs on port 8080 (not default 5173)
- The `lovable-tagger` plugin is enabled in development mode for Lovable integration
- All custom routes must be added ABOVE the catch-all `*` route in App.tsx
- Supabase client file is auto-generated - do not manually edit the header comment
- `.env` is gitignored - never commit sensitive credentials
