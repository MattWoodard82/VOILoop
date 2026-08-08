/**
 * Encryption utilities for nudge responses.
 * Uses pgcrypto in PostgreSQL for AES256-compatible encryption.
 * Keys are fetched from environment or KMS.
 */

/**
 * Get the encryption key for nudge responses.
 * In production, this would fetch from Azure Key Vault or AWS Secrets Manager.
 * The key should NOT be committed to source; use environment variables only.
 */
function getEncryptionKey(): string {
  // Fetch from environment variable (must be set in deployment)
  const key = process.env.NUDGE_RESPONSE_ENCRYPTION_KEY
  if (!key) {
    throw new Error('NUDGE_RESPONSE_ENCRYPTION_KEY environment variable is not set. Set this to a strong encryption key from your KMS.')
  }
  return key
}

/**
 * Encrypt plaintext using the nudge response encryption key.
 * This runs on the application side; the database stores encrypted_bytea.
 * In practice, we rely on pgcrypto's pgp_sym_encrypt in the database RPC
 * to handle encryption, but if application-side encryption is needed:
 */
export function encryptNudgeResponse(plaintext: string): string {
  // Note: This would require a Node.js crypto library that matches pgcrypto's format.
  // For now, we pass plaintext to Supabase RPC which calls pgp_sym_encrypt.
  // The database handles encryption via the migration:
  // INSERT INTO nudge_acknowledgements (..., response_text_encrypted)
  // VALUES (..., pgp_sym_encrypt(?, key))
  return plaintext // Passed to DB for encryption via RPC
}

/**
 * Decrypt nudge response using the shared encryption key.
 * Called after fetching encrypted_bytea from database.
 * In practice, Supabase RPC or a stored procedure handles decryption.
 */
export function decryptNudgeResponse(encryptedData: string | null): string | null {
  if (!encryptedData) return null
  // Note: If Supabase RPC is not available, this would require pgcrypto-compatible decryption.
  // For now, assume the database returns decrypted data via RPC or stored procedure.
  // Example Supabase RPC call in route:
  // const { data, error } = await supabase.rpc('pgp_sym_decrypt', {
  //   encrypted_data: row.response_text_encrypted,
  //   key: getEncryptionKey()
  // })
  return encryptedData
}

/**
 * Get the encryption key for database operations.
 * Exported so routes can pass it to database RPCs.
 * IMPORTANT: This key should come from environment/KMS, never hardcoded.
 */
export function getDbEncryptionKey(): string {
  return getEncryptionKey()
}
