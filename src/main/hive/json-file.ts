import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function readJsonArray<T>(filePath: string): Promise<T[]> {
  try {
    const raw = await readFile(filePath, 'utf8')
    return JSON.parse(raw) as T[]
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw err
  }
}

export async function writeJsonArray<T>(filePath: string, items: T[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(items, null, 2)}\n`, 'utf8')
}
