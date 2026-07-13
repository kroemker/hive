import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let userDataDir: string

vi.mock('electron', () => {
  const store = new Map<string, boolean>()
  return {
    app: {
      getPath: () => userDataDir
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      // A fake but reversible "encryption" is enough to exercise the encode/decode path.
      encryptString: (plain: string) => Buffer.from(plain, 'utf8'),
      decryptString: (buf: Buffer) => buf.toString('utf8')
    },
    __store: store
  }
})

describe('secrets', () => {
  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'hive-secrets-'))
  })

  afterEach(async () => {
    await rm(userDataDir, { recursive: true, force: true })
  })

  it('has no api key by default', async () => {
    const { getAnthropicApiKey, hasAnthropicApiKey } = await import('./secrets')
    expect(await hasAnthropicApiKey()).toBe(false)
    expect(await getAnthropicApiKey()).toBeNull()
  })

  it('stores and retrieves an api key', async () => {
    const { getAnthropicApiKey, hasAnthropicApiKey, setAnthropicApiKey } = await import(
      './secrets'
    )
    await setAnthropicApiKey('sk-ant-test-123')

    expect(await hasAnthropicApiKey()).toBe(true)
    expect(await getAnthropicApiKey()).toBe('sk-ant-test-123')
  })

  it('clears a stored api key', async () => {
    const { clearAnthropicApiKey, getAnthropicApiKey, setAnthropicApiKey } = await import(
      './secrets'
    )
    await setAnthropicApiKey('sk-ant-test-123')
    await clearAnthropicApiKey()

    expect(await getAnthropicApiKey()).toBeNull()
  })
})
