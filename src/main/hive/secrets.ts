import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'

interface SecretsFile {
  /** Base64-encoded `safeStorage.encryptString` output. */
  anthropicApiKeyEncrypted?: string
  /** Only ever written when the OS has no keychain/keyring to encrypt with. */
  anthropicApiKeyPlain?: string
}

/**
 * A single optional Anthropic API key, stored globally (not per-repo, since `.hive/config.yaml`
 * is committed to the user's repo and must never carry secrets). Encrypted at rest via the OS
 * keychain through Electron's `safeStorage` where available; falls back to a plaintext file with
 * a logged warning on Linux setups with no secret service, rather than refusing to save at all.
 */
function secretsFilePath(): string {
  return join(app.getPath('userData'), 'secrets.json')
}

async function readSecretsFile(): Promise<SecretsFile> {
  try {
    return JSON.parse(await readFile(secretsFilePath(), 'utf8')) as SecretsFile
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}
    }
    throw err
  }
}

export async function getAnthropicApiKey(): Promise<string | null> {
  const file = await readSecretsFile()
  if (file.anthropicApiKeyEncrypted) {
    return safeStorage.decryptString(Buffer.from(file.anthropicApiKeyEncrypted, 'base64'))
  }
  return file.anthropicApiKeyPlain ?? null
}

export async function hasAnthropicApiKey(): Promise<boolean> {
  return (await getAnthropicApiKey()) !== null
}

export async function setAnthropicApiKey(apiKey: string): Promise<void> {
  const file: SecretsFile = safeStorage.isEncryptionAvailable()
    ? { anthropicApiKeyEncrypted: safeStorage.encryptString(apiKey).toString('base64') }
    : { anthropicApiKeyPlain: apiKey }
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn(
      'Hive: no OS keychain available - storing the Anthropic API key in plain text at',
      secretsFilePath()
    )
  }
  await writeFile(secretsFilePath(), JSON.stringify(file), 'utf8')
}

export async function clearAnthropicApiKey(): Promise<void> {
  await writeFile(secretsFilePath(), JSON.stringify({}), 'utf8')
}
