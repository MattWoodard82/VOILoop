import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const ENCRYPTION_VERSION = 'v1'
const IV_LENGTH_BYTES = 12
const AUTH_TAG_LENGTH_BYTES = 16

export interface KmsEnvelope {
  decrypt(ciphertext: Buffer): Promise<Buffer>
  encrypt?(plaintext: Buffer): Promise<Buffer>
}

export interface EncryptionKeyProvider {
  getActiveKey(): Promise<Buffer>
  getKeyById(keyId: string): Promise<Buffer>
}

class EnvironmentKeyProvider implements EncryptionKeyProvider {
  async getActiveKey(): Promise<Buffer> {
    const keyId = process.env.NUDGE_RESPONSE_KMS_KEY_ID ?? 'local-dev'
    return this.getKeyById(keyId)
  }

  async getKeyById(keyId: string): Promise<Buffer> {
    const rawKey = process.env.NUDGE_RESPONSE_ENCRYPTION_KEY
    if (!rawKey) {
      throw new Error('Missing NUDGE_RESPONSE_ENCRYPTION_KEY for nudge acknowledgement encryption.')
    }

    return deriveAesKey(rawKey, keyId)
  }
}

function deriveAesKey(secret: string, keyId: string): Buffer {
  return createHash('sha256')
    .update(`${keyId}:${secret}`, 'utf8')
    .digest()
}

export interface EncryptedFieldPayload {
  keyId: string
  ciphertext: string
  iv: string
  authTag: string
  version: string
}

export interface EncryptedNudgeResponse {
  plaintext?: string
  ciphertext: Buffer
  payload: EncryptedFieldPayload
}

export async function encryptNudgeResponseText(
  plaintext: string,
  provider: EncryptionKeyProvider = new EnvironmentKeyProvider()
): Promise<EncryptedNudgeResponse> {
  const keyId = process.env.NUDGE_RESPONSE_KMS_KEY_ID ?? 'local-dev'
  const key = await provider.getActiveKey()
  const iv = randomBytes(IV_LENGTH_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  const payload: EncryptedFieldPayload = {
    keyId,
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    version: ENCRYPTION_VERSION,
  }

  return {
    plaintext,
    ciphertext: serializeEncryptedFieldPayload(payload),
    payload,
  }
}

export async function decryptNudgeResponseText(
  ciphertext: Buffer | Uint8Array | ArrayBuffer,
  provider: EncryptionKeyProvider = new EnvironmentKeyProvider()
): Promise<string> {
  const payload = deserializeEncryptedFieldPayload(ciphertext)
  const key = await provider.getKeyById(payload.keyId)
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(payload.iv, 'base64')
  )
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'))

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ])

  return plaintext.toString('utf8')
}

export function serializeEncryptedFieldPayload(payload: EncryptedFieldPayload): Buffer {
  return Buffer.from(JSON.stringify(payload), 'utf8')
}

export function deserializeEncryptedFieldPayload(
  ciphertext: Buffer | Uint8Array | ArrayBuffer
): EncryptedFieldPayload {
  const buffer = Buffer.isBuffer(ciphertext)
    ? ciphertext
    : ciphertext instanceof Uint8Array
      ? Buffer.from(ciphertext)
      : Buffer.from(ciphertext)

  const parsed = JSON.parse(buffer.toString('utf8')) as Partial<EncryptedFieldPayload>
  if (
    !parsed ||
    typeof parsed.keyId !== 'string' ||
    typeof parsed.ciphertext !== 'string' ||
    typeof parsed.iv !== 'string' ||
    typeof parsed.authTag !== 'string' ||
    typeof parsed.version !== 'string'
  ) {
    throw new Error('Invalid encrypted nudge response payload.')
  }

  return {
    keyId: parsed.keyId,
    ciphertext: parsed.ciphertext,
    iv: parsed.iv,
    authTag: parsed.authTag,
    version: parsed.version,
  }
}

export function createKmsEnvelopeKeyProvider(kmsEnvelope: KmsEnvelope): EncryptionKeyProvider {
  return {
    async getActiveKey() {
      const keyId = process.env.NUDGE_RESPONSE_KMS_KEY_ID ?? 'local-dev'
      return this.getKeyById(keyId)
    },
    async getKeyById(keyId: string) {
      const wrappedKey = process.env.NUDGE_RESPONSE_WRAPPED_KEY
      if (!wrappedKey) {
        throw new Error('Missing NUDGE_RESPONSE_WRAPPED_KEY for external KMS decryption.')
      }

      return kmsEnvelope.decrypt(Buffer.from(`${keyId}:${wrappedKey}`, 'utf8'))
    },
  }
}
