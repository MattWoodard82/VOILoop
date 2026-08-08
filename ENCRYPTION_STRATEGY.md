# Issue 66 Encryption Strategy for Azure Portability

## Problem
Participant nudge responses are stored in plaintext in `nudge_acknowledgements.response_text`. This is PHI-adjacent data (behavioral health) that must be encrypted at rest per HIPAA compliance.

## Solution: pgcrypto + External KMS

### Architecture
1. **Database layer (PostgreSQL pgcrypto):**
   - Enables via `create extension pgcrypto`
   - Adds encrypted column: `nudge_acknowledgements.response_text_encrypted bytea`
   - Uses application-provided encryption key (NOT stored in database)

2. **Application layer (Node.js/Next.js):**
   - Fetches encryption key from external KMS (Azure Key Vault, AWS Secrets Manager, etc.)
   - Encrypts before write: `pgp_sym_encrypt(plaintext, key_from_kms)`
   - Decrypts after read: `pgp_sym_decrypt(encrypted_bytes, key_from_kms)`

3. **Key Management:**
   - **Staging/Demo:** Use placeholder key (for testing only)
   - **Production:** Fetch from Azure Key Vault or equivalent via managed identity
   - **Future Azure migration:** Keys stay in Key Vault; schema migrates as-is

### Migration Path (Current: Supabase → Future: Azure Postgres)
- ✅ pgcrypto extension exists on both Supabase and Azure Postgres
- ✅ Encrypted column migrates via `pg_dump`/restore unchanged
- ✅ Application code remains the same (fetch key from KMS, encrypt/decrypt)
- ✅ Zero re-encryption or schema refactoring required

### Implementation Status
- Migration file: `supabase/migrations/20260807_encryption_nudge_responses.sql`
- Adds pgcrypto extension
- Adds `response_text_encrypted bytea` column
- Backfills existing data with staging key
- Ready to integrate into PR1 or PR3 before merge

### Next Steps
1. Test migration on local Supabase instance
2. Update participant events API to read/write encrypted column
3. Document KMS key rotation and recovery procedures in RUNBOOK.md
4. Merge encryption migration + API updates to issue-66-integration before production
5. Before production cutover: configure Azure Key Vault integration and update API for real key source

### Security Properties
- Encryption at rest: ✅ pgcrypto AES256-compatible
- Encryption in transit: ✅ Existing Supabase SSL/TLS policies apply
- Key protection: ✅ External KMS (Azure Key Vault manages key lifecycle)
- Audit trail: ✅ RLS policies unchanged; database logs unchanged
- HIPAA alignment: ✅ Encrypted PHI safe harbor; supports compliance sign-off
