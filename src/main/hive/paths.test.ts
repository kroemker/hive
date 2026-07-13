import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findRepoRoot, pathExists } from './paths'

describe('pathExists', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hive-paths-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('is true for a path that exists', async () => {
    expect(await pathExists(dir)).toBe(true)
  })

  it('is false for a path that does not exist', async () => {
    expect(await pathExists(join(dir, 'nope'))).toBe(false)
  })
})

describe('findRepoRoot', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hive-repo-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('finds the repo root from a nested subdirectory', async () => {
    await mkdir(join(dir, '.git'))
    const nested = join(dir, 'src', 'components')
    await mkdir(nested, { recursive: true })

    expect(await findRepoRoot(nested)).toBe(dir)
  })

  it('finds the repo root when starting at the root itself', async () => {
    await mkdir(join(dir, '.git'))
    expect(await findRepoRoot(dir)).toBe(dir)
  })

  it('returns null when no .git directory exists up the tree', async () => {
    expect(await findRepoRoot(dir)).toBeNull()
  })
})
