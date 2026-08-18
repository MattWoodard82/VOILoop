-- Fix: nudge acknowledgement save fails with
--   "new row for relation \"nudge_acknowledgements\" violates check constraint
--    \"nudge_acknowledgements_response_text_check\""
--
-- Root cause: 20260807180000_nudge_expansion.sql added an unnamed check
-- constraint requiring non-empty `response_text`. 20260808000100_encrypt_nudge_acknowledgements.sql
-- later moved participant responses to the encrypted `response_text_encrypted`
-- column (per ENCRYPTION_STRATEGY.md) and 20260811040000_harden_nudge_history_and_access.sql's
-- upsert_nudge_acknowledgement RPC intentionally writes response_text = ''
-- going forward. The old check constraint was never dropped, so every
-- acknowledgement upsert now fails at the database layer.
--
-- response_text_encrypted is already `not null`, so it remains the enforced
-- source of truth for the response content. Drop the stale plaintext check.

alter table public.nudge_acknowledgements
  drop constraint if exists nudge_acknowledgements_response_text_check;
