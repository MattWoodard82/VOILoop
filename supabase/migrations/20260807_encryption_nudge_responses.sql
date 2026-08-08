-- Enable pgcrypto extension for encryption support (portable to Azure Postgres)
create extension if not exists pgcrypto;

-- Add encrypted response_text column to nudge_acknowledgements
alter table if exists public.nudge_acknowledgements
  add column if not exists response_text_encrypted bytea;

-- Migrate existing response_text to encrypted form (using a placeholder staging key)
-- Note: In production, use external KMS (Azure Key Vault, AWS Secrets Manager) via application layer
-- This migration uses pgp_sym_encrypt for staging/demo; production must inject real key from KMS
update public.nudge_acknowledgements
set response_text_encrypted = 
  case 
    when response_text != '' 
    then pgp_sym_encrypt(response_text, 'staging-placeholder-key-only-for-demo')::bytea
    else null
  end
where response_text_encrypted is null;

-- Make response_text_encrypted non-nullable (after migration completes)
alter table if exists public.nudge_acknowledgements
  alter column response_text_encrypted set not null;

-- Create index on encrypted responses for participant lookup
create index if not exists idx_nudge_acknowledgements_encrypted_participant_id
  on public.nudge_acknowledgements(participant_id)
  where response_text_encrypted is not null;

-- Ensure RLS policies remain intact for encrypted column
-- Existing nudge_acknowledgements_select_scoped and nudge_acknowledgements_participant_insert policies apply to all columns

-- Document: Application code must decrypt via external KMS
-- Example pattern (Node.js):
-- const key = await kms.getKey('nudge-response-encryption-key'); // from Azure Key Vault, AWS Secrets Manager, or Supabase Vault
-- const decrypted = await supabase.rpc('decrypt_nudge_response', { encrypted_data: row.response_text_encrypted, key });
-- Or application-side: pgp_sym_decrypt(encrypted_data, key) in API layer

-- TODO: Add stored procedure for decryption access pattern (optional, depends on KMS architecture)
-- create or replace function decrypt_nudge_response(encrypted_data bytea, key text)
-- returns text as $$
--   select pgp_sym_decrypt(encrypted_data, key)::text
-- $$ language sql security definer;
