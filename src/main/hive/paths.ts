import { access } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Walks up from `startPath` looking for a `.git` directory, returning its parent. */
export async function findRepoRoot(startPath: string): Promise<string | null> {
  let dir = startPath
  for (;;) {
    if (await pathExists(join(dir, '.git'))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) {
      return null
    }
    dir = parent
  }
}
