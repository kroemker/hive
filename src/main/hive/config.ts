import { readFile, writeFile } from 'node:fs/promises'
import { dump, load } from 'js-yaml'
import { DEFAULT_HIVE_CONFIG, type HiveConfig } from '../../shared/hive/types'

export async function readConfig(configPath: string): Promise<HiveConfig> {
  let raw: string
  try {
    raw = await readFile(configPath, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...DEFAULT_HIVE_CONFIG }
    }
    throw err
  }
  const parsed = (load(raw) as Partial<HiveConfig> | undefined) ?? {}
  return { ...DEFAULT_HIVE_CONFIG, ...parsed }
}

export async function writeConfig(configPath: string, config: HiveConfig): Promise<void> {
  await writeFile(configPath, dump(config, { lineWidth: 100, sortKeys: false }), 'utf8')
}
