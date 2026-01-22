# Mercado Pago OAuth Implementation Guide

## Overview

This application now uses **Mercado Pago OAuth** to allow users to connect their Mercado Pago accounts directly. This eliminates the need for users to manually copy Access Tokens and provides a more secure, user-friendly experience.

## How It Works

### User Flow

1. **Connect Account (Dashboard)**
   - User goes to Dashboard
   - Sees MercadoPagoConnect card
   - Clicks "Conectar con Mercado Pago"
   - Redirected to Mercado Pago authorization page
   - Logs in and authorizes the application
   - Redirected back to Dashboard with confirmation

2. **Create Raffle**
   - If MP account is connected, payments are automatically enabled
   - No manual token configuration needed

3. **Buyer Payment**
   - Buyer selects number(s)
   - Clicks "Pagar" button
   - Redirected to Mercado Pago checkout
   - Completes payment
   - Redirected back to raffle page
   - Number status changes to "paid"

4. **Owner Confirmation**
   - Owner sees numbers in "paid" status (blue)
   - Clicks on paid number
   - Verifies payment received in MP account
   - Clicks "Confirmar Venta" → status changes to "sold"
   - Or clicks "Rechazar" → number returns to "available"

## Technical Implementation

### 1. Database Schema

New fields in `profiles` table:

```sql
-- Run this migration in Supabase SQL Editor
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS mp_access_token TEXT,
ADD COLUMN IF NOT EXISTS mp_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS mp_public_key TEXT,
ADD COLUMN IF NOT EXISTS mp_user_id TEXT,
ADD COLUMN IF NOT EXISTS mp_connected_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_mp_user_id ON profiles(mp_user_id);
```

**File**: `supabase/add_mp_oauth_fields.sql`

### 2. Supabase Edge Function

OAuth callback handler that exchanges authorization code for access token:

**Location**: `supabase/functions/mp-oauth-callback/index.ts`

**What it does**:
- Receives authorization code from Mercado Pago
- Exchanges code for access token
- Gets user info from Mercado Pago
- Stores tokens in `profiles` table
- Redirects user back to Dashboard

**Deploy command**:
```bash
supabase functions deploy mp-oauth-callback
```

### 3. Frontend Components

#### MercadoPagoConnect Component

**File**: `src/components/MercadoPagoConnect.tsx`

**Features**:
- Shows connection status (connected/not connected)
- "Connect" button initiates OAuth flow
- Displays connected user ID
- "Disconnect" button to remove connection

**Usage**:
```tsx
<MercadoPagoConnect userId={user.id} />
```

#### Updated RaffleView

**Changes**:
- Loads `mp_access_token` from owner's profile
- Passes token to NumberGrid for payment creation
- Removed manual token input from edit dialog

#### Updated NumberGrid

**Changes**:
- Uses `raffle.mercadopago_access_token` (now from OAuth)
- No longer checks `mercadopago_enabled` flag
- Payment enabled if token exists

### 4. Environment Variables

#### Required for Development and Production

Add these to your `.env` file (local) and Vercel/Supabase dashboard (production):

```bash
# Mercado Pago OAuth
VITE_MP_CLIENT_ID=your_app_id_here
VITE_MP_REDIRECT_URI=https://your-project-ref.supabase.co/functions/v1/mp-oauth-callback

# Supabase (for Edge Function)
MP_CLIENT_ID=your_app_id_here
MP_CLIENT_SECRET=your_app_secret_here
MP_REDIRECT_URI=https://your-project-ref.supabase.co/functions/v1/mp-oauth-callback
APP_URL=https://your-app-url.vercel.app

# Standard Supabase vars (already configured)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Setup Instructions

### Step 1: Create Mercado Pago Application

1. Go to https://www.mercadopago.com.ar/developers/panel
2. Click "Tus aplicaciones" → "Crear aplicación"
3. Fill in:
   - **Nombre**: Raffle Fast (or your app name)
   - **Descripción breve**: Application for managing raffles
   - **Redirect URI**: `https://YOUR_SUPABASE_PROJECT.supabase.co/functions/v1/mp-oauth-callback`
4. Click "Crear aplicación"
5. Note your **App ID** and **Client Secret**

### Step 2: Configure Supabase Edge Function

1. **Set Supabase secrets** (run these commands with Supabase CLI):

```bash
supabase secrets set MP_CLIENT_ID=your_app_id
supabase secrets set MP_CLIENT_SECRET=your_client_secret
supabase secrets set MP_REDIRECT_URI=https://YOUR_PROJECT.supabase.co/functions/v1/mp-oauth-callback
supabase secrets set APP_URL=https://your-app.vercel.app
```

2. **Deploy the Edge Function**:

```bash
cd supabase/functions
supabase functions deploy mp-oauth-callback
```

### Step 3: Configure Frontend Environment Variables

**For Vercel (Production)**:

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add:
   - `VITE_MP_CLIENT_ID` = your App ID
   - `VITE_MP_REDIRECT_URI` = your Supabase Edge Function URL

**For Local Development** (`.env`):

```bash
VITE_MP_CLIENT_ID=your_app_id_here
VITE_MP_REDIRECT_URI=http://localhost:54321/functions/v1/mp-oauth-callback
```

### Step 4: Run Database Migration

1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `supabase/add_mp_oauth_fields.sql`
3. Paste and run the SQL

### Step 5: Deploy Frontend

```bash
npm run build
# Deploy to Vercel
```

## Testing the OAuth Flow

### Local Testing

1. **Start Supabase locally**:
```bash
supabase start
supabase functions serve mp-oauth-callback --env-file .env
```

2. **Update redirect URI in MP app** to:
   `http://localhost:54321/functions/v1/mp-oauth-callback`

3. **Test the flow**:
   - Navigate to `/dashboard`
   - Click "Conectar con Mercado Pago"
   - Authorize in MP
   - Should redirect back to Dashboard

### Production Testing

1. Ensure all environment variables are set in Vercel and Supabase
2. Deploy Edge Function and Frontend
3. Test OAuth flow in production
4. Verify tokens are stored in `profiles` table

## Security Considerations

### Token Storage

- Access tokens are stored in `profiles` table
- Supabase has Row Level Security (RLS) enabled
- Only authenticated users can read their own tokens
- Tokens are not exposed to client-side code

### Token Refresh

Currently, tokens do not auto-refresh. If a token expires:
- User will need to reconnect their MP account
- Consider implementing token refresh in future (using `mp_refresh_token`)

### Recommended RLS Policy

```sql
-- Only allow users to read their own MP tokens
CREATE POLICY "Users can read own mp_access_token"
ON profiles FOR SELECT
USING (auth.uid() = id);

-- Only Edge Function can update MP tokens
CREATE POLICY "Service role can update mp tokens"
ON profiles FOR UPDATE
USING (auth.role() = 'service_role');
```

## Differences from Manual Token Approach

| Feature | Manual Token | OAuth |
|---------|-------------|-------|
| Setup complexity | Medium (copy/paste token) | Low (one click) |
| User experience | Technical (requires MP dev panel) | Simple (just authorize) |
| Security | Users handle tokens manually | Tokens managed automatically |
| Token expiration | Manual renewal needed | Can implement auto-refresh |
| Number of steps | 5+ steps | 2 clicks |

## Troubleshooting

### "OAuth authorization failed"

- Check that MP app credentials match environment variables
- Verify redirect URI is exactly the same in MP app and config
- Check Supabase Edge Function logs: `supabase functions logs mp-oauth-callback`

### "Missing Mercado Pago configuration"

- Ensure all environment variables are set in Supabase secrets
- Redeploy Edge Function after setting secrets

### Tokens not saving

- Check RLS policies on `profiles` table
- Verify Edge Function has `SUPABASE_SERVICE_ROLE_KEY` set
- Check Supabase logs for database errors

### Redirect not working

- Verify `APP_URL` environment variable matches your frontend URL
- Check that Vercel deployment is live
- Ensure no trailing slashes in URLs

## Migration Guide (from Manual Tokens)

If you have existing raffles with manual tokens:

1. **Old raffles will continue to work** - the `mercadopago_access_token` column on `raffles` table is still read
2. **New approach**: Token is loaded from owner's `profiles.mp_access_token`
3. **Users should**:
   - Connect their MP account via Dashboard
   - Old manual tokens will be ignored in favor of OAuth tokens
4. **Optional cleanup**:
   ```sql
   -- Remove old manual token columns (optional)
   ALTER TABLE raffles DROP COLUMN IF EXISTS mercadopago_access_token;
   ALTER TABLE raffles DROP COLUMN IF EXISTS mercadopago_enabled;
   ```

## Future Enhancements

1. **Token Refresh**: Implement automatic token refresh using `mp_refresh_token`
2. **Webhook Integration**: Use MP webhooks for real-time payment status updates
3. **Multiple Accounts**: Allow users to manage multiple MP accounts
4. **Payment History**: Show detailed payment history from MP API
5. **Automatic Payouts**: Integrate MP money-out API for automatic withdrawals

## Support

For issues related to:
- **Mercado Pago OAuth**: https://www.mercadopago.com.ar/developers/es/support
- **Supabase Edge Functions**: https://supabase.com/docs/guides/functions
- **This implementation**: Check GitHub issues or contact support
