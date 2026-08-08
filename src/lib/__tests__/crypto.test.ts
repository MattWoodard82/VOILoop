import {
  decryptNudgeResponseText,
  deserializeEncryptedFieldPayload,
  encryptNudgeResponseText,
  serializeEncryptedFieldPayload,
  type EncryptionKeyProvider,
} from '../crypto'

class StaticKeyProvider implements EncryptionKeyProvider {
  constructor(private readonly key: Buffer, private readonly keyId: string) {}

  async getActiveKey(): Promise<Buffer> {
    return this.key
  }

  async getKeyById(requestedKeyId: string): Promise<Buffer> {
    if (requestedKeyId !== this.keyId) {
      throw new Error(`Unexpected key id ${requestedKeyId}`)
    }

    return this.key
  }
}

describe('crypto helpers', () => {
  const originalKeyId = process.env.NUDGE_RESPONSE_KMS_KEY_ID

  beforeEach(() => {
    process.env.NUDGE_RESPONSE_KMS_KEY_ID = 'test-key'
  })

  afterAll(() => {
    if (originalKeyId === undefined) {
      delete process.env.NUDGE_RESPONSE_KMS_KEY_ID
      return
    }

    process.env.NUDGE_RESPONSE_KMS_KEY_ID = originalKeyId
  })

  test('encrypts and decrypts nudge acknowledgement text via application-layer payloads', async () => {
    const provider = new StaticKeyProvider(Buffer.alloc(32, 7), 'test-key')
    const encrypted = await encryptNudgeResponseText('Will do', provider)

    expect(encrypted.ciphertext.equals(Buffer.from('Will do', 'utf8'))).toBe(false)
    expect(encrypted.payload.keyId).toBe('test-key')

    await expect(decryptNudgeResponseText(encrypted.ciphertext, provider)).resolves.toBe('Will do')
  })

  test('serializes and deserializes payloads for bytea storage', () => {
    const buffer = serializeEncryptedFieldPayload({
      keyId: 'kms-key-1',
      ciphertext: 'abc',
      iv: 'def',
      authTag: 'ghi',
      version: 'v1',
    })

    expect(deserializeEncryptedFieldPayload(buffer)).toEqual({
      keyId: 'kms-key-1',
      ciphertext: 'abc',
      iv: 'def',
      authTag: 'ghi',
      version: 'v1',
    })
  })
})
