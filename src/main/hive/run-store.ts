import { readFile, writeFile } from 'node:fs/promises'
import { dump, load } from 'js-yaml'
import type { RunMeta } from '../../shared/hive/types'

export async function readRunMeta(metaPath: string): Promise<RunMeta | null> {
  try {
    const raw = await readFile(metaPath, 'utf8')
    return load(raw) as RunMeta
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw err
  }
}

export async function writeRunMeta(metaPath: string, meta: RunMeta): Promise<void> {
  await writeFile(metaPath, dump(meta, { lineWidth: 100, sortKeys: false }), 'utf8')
}
