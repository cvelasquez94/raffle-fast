-- Add Mercado Pago OAuth fields to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS mp_access_token TEXT,
ADD COLUMN IF NOT EXISTS mp_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS mp_public_key TEXT,
ADD COLUMN IF NOT EXISTS mp_user_id TEXT,
ADD COLUMN IF NOT EXISTS mp_connected_at TIMESTAMPTZ;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_mp_user_id ON profiles(mp_user_id);

-- Add comment for documentation
COMMENT ON COLUMN profiles.mp_access_token IS 'Mercado Pago OAuth access token (encrypted at rest)';
COMMENT ON COLUMN profiles.mp_refresh_token IS 'Mercado Pago OAuth refresh token for token renewal';
COMMENT ON COLUMN profiles.mp_public_key IS 'Mercado Pago public key for client-side integration';
COMMENT ON COLUMN profiles.mp_user_id IS 'Mercado Pago user ID';
COMMENT ON COLUMN profiles.mp_connected_at IS 'Timestamp when Mercado Pago account was connected';
